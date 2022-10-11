/* eslint-disable no-param-reassign, no-console */
// # Deploying the Currency Contracts
// Currency deployment is broke into 4 distinct stages, each laying the
// foundation for the following stages. The process depends on ethers.js, and the
// compiled JSON ABIs and deploy transaction bytecode for the contracts
// involved. It also depends on creating and sending a pre-generated and pre-signed
// transaction to bootstrap the process. This transaction is generated using Nick's Method to
// keep the addresses resulting from the deployment process constant across all
// networks.

// ####### Parameters for Full Deploy ########
/*
 * options: an object which holds the following parameters:
 *
 * account: an account is required to be the interim owner of the contracts during the deploy
 *          and before they are initialized.
 * trustedNodes: the list of addresses to be the initial trustees
 * trusteeVoteReward: a stringified number for the amount of ECOx awarded to trustees on each vote
 * production: boolean flag for if the deploy is to chain or should include test contracts
 * verbose: boolean flag for logging, production overrides this and is always verbose
 * initialECO: an array of { holder; balance } objects for initial ECO distribution
 * initialECOx: same as initialECO but for ECOx
 */

// ## Dependencies
const nick = require('./nicks')
const ethers = require('ethers')
const { BigNumber } = ethers

let BLOCK_GAS_LIMIT = 6000000
const implSlot =
  '0xf86c915dad5894faca0dfa067c58fdf4307406d255ed0a65db394f82b77f53d4'
const { ERC1820_REGISTRY, REGISTRY_DEPLOY_TX } = require('../tools/constants')

// ### Contract ABIs and Bytecode
/* eslint-disable import/no-unresolved */
const PolicyArtifact = require(`../artifacts/contracts/policy/Policy.sol/Policy.json`)
const PolicyTestArtifact = require(`../artifacts/contracts/test/Backdoor.sol/PolicyTest.json`)
const PolicyInitArtifact = require(`../artifacts/contracts/policy/PolicyInit.sol/PolicyInit.json`)
const EcoBootstrapArtifact = require(`../artifacts/contracts/deploy/EcoBootstrap.sol/EcoBootstrap.json`)
const EcoInitializableArtifact = require(`../artifacts/contracts/deploy/EcoInitializable.sol/EcoInitializable.json`)
const TimedPoliciesArtifact = require(`../artifacts/contracts/governance/TimedPolicies.sol/TimedPolicies.json`)
const TrustedNodesArtifact = require(`../artifacts/contracts/governance/monetary/TrustedNodes.sol/TrustedNodes.json`)
const RootHashProposalArtifact = require(`../artifacts/contracts/governance/monetary/InflationRootHashProposal.sol/InflationRootHashProposal.json`)
const RandomInflationArtifact = require(`../artifacts/contracts/governance/monetary/RandomInflation.sol/RandomInflation.json`)
const CurrencyGovernanceArtifact = require(`../artifacts/contracts/governance/monetary/CurrencyGovernance.sol/CurrencyGovernance.json`)
const CurrencyTimerArtifact = require(`../artifacts/contracts/governance/CurrencyTimer.sol/CurrencyTimer.json`)
const LockupArtifact = require(`../artifacts/contracts/governance/monetary/Lockup.sol/Lockup.json`)
const PolicyProposalsArtifact = require(`../artifacts/contracts/governance/community/PolicyProposals.sol/PolicyProposals.json`)
const PolicyVotesArtifact = require(`../artifacts/contracts/governance/community/PolicyVotes.sol/PolicyVotes.json`)
const ECOxStakingArtifact = require(`../artifacts/contracts/governance/community/ECOxStaking.sol/ECOxStaking.json`)
const ECOArtifact = require(`../artifacts/contracts/currency/ECO.sol/ECO.json`)
const FaucetArtifact = require(`../artifacts/contracts/deploy/EcoFaucet.sol/EcoFaucet.json`)
const TokenInitArtifact = require(`../artifacts/contracts/currency/TokenInit.sol/TokenInit.json`)
const VDFVerifierArtifact = require(`../artifacts/contracts/VDF/VDFVerifier.sol/VDFVerifier.json`)
const ECOxArtifact = require(`../artifacts/contracts/currency/ECOx.sol/ECOx.json`)
/* eslint-enable import/no-unresolved */

async function parseFlags(options) {
  // we currently require 6 proxies for deployment
  options.numPlaceholders = '6'

  if (!options.gasMultiplier) {
    options.gasMultiplier = 5
  }

  if (!options.gasPrice) {
    options.gasPrice = (await options.signer.getGasPrice()).mul(
      options.gasMultiplier
    )
  } else {
    options.gasPrice = BigNumber.from(options.gasPrice)
  }

  options.gasUsed = ethers.BigNumber.from(0)

  if (!options.randomVDFDifficulty) {
    options.randomVDFDifficulty = 3
  }

  if (options.production) {
    options.verbose = true
  }
  if (options.verbose) {
    console.log(`verbose deploy: ${options.verbose}`)
  }
  if (options.production) {
    options.correctPolicyArtifact = PolicyArtifact
  } else {
    if (options.verbose) {
      console.log('This is a test, using the testing policy.')
    }
    options.correctPolicyArtifact = PolicyTestArtifact
  }

  if (options.initialECO) {
    options.initialECOSupply = options.initialECO
      .map((initial) => initial.balance)
      .reduce((a, b) => BigNumber.from(a).add(BigNumber.from(b)).toString())
  }
  if (options.initialECOx) {
    options.initialECOxSupply = options.initialECOx
      .map((initial) => initial.balance)
      .reduce((a, b) => BigNumber.from(a).add(BigNumber.from(b)).toString())
  }

  // set CI parameters for automated tests
  if (options.test) {
    options.randomVDFDifficulty = 3
    options.initialECOSupply = '0'
    options.initialECOxSupply = '1000000000000000000000'
    options.initialECOx = [
      { holder: options.account, balance: '1000000000000000000000' },
    ]
    options.trusteeVoteReward = options.trusteeVoteReward || '1000'
  }

  if (!options.pauser) {
    options.pauser = ethers.constants.AddressZero
  }

  return options
}

// helper function that's used to figure out
async function checkIsProxyBound(proxyAddress, provider, verbose) {
  if (verbose) {
    console.log(`Checking status of proxy ${proxyAddress}`)
  }
  const proxyImpl = await provider.getStorageAt(proxyAddress, implSlot)
  // this allows us to know the EcoInitializable address
  if (verbose) {
    console.log(`found implementation ${proxyImpl}`)
  }
  // guess that the implementation is an EcoInitializable
  // aka that the proxy is uninitialized
  const proxy = new ethers.Contract(
    proxyAddress,
    EcoInitializableArtifact.abi,
    provider
  )
  try {
    const initializableOwner = await proxy.owner()
    if (verbose) {
      console.log(`found owner: ${initializableOwner}`)
    }
    return { owner: initializableOwner, impl: proxyImpl }
  } catch {
    if (verbose) {
      console.log(
        `EcoInitializable not present at ${proxyAddress}, proxy likely already bound`
      )
    }
    return { initialized: true }
  }
}

// ## Deployment Stages
// Each deployment stage lays groundwork for future stages. They must be run in order.
//
// Stages also accumulate and pass along data for use in future stages, such as
// contract addresses and local objects for reuse. This data is stored in the
// `options` object.

// ### Stage 1
// In order to keep deployment addresses constant we use a set of proxies set up
// by a bootstrap contract which instantiates a list of slots we can use to create proxies
// and to hold addresses as part of the deployment process.
//
// Each of the instatiated contracts creates a forwarding proxy (`ForwardProxy`)
// pointing to a placeholder allowing the `owner` address that started the deployment
// to set the forwarding target at some point in the future (`EcoIntializable`).
// All of the proxy addresses are stored in `options.bootstrap.placeholders` for
// future reference.
//
// Deploying the bootstrap contract is expensive, as the deploy instantiates
// multiple additional contracts and initializes storage. Additionally, since
// the gas price and amount must be set as part of the signed contract data
// these parameters are fixed at values that allow fast deployment on _any_
// network (i.e. they're higher than they need to be).
//
async function deployStage1(options) {
  let bootstrapGas
  const limit = (await options.ethersProvider.getBlock('latest')).gasLimit

  if (options.production) {
    if (BLOCK_GAS_LIMIT > 0.95 * limit) {
      throw Error(
        `Gas limit (${BLOCK_GAS_LIMIT}) too high compared to block limit (${limit}); unlikely to succeed in deploying`
      )
    }
    // bootstrapGas = 4538418; // old estimate, included 20 proxies
    bootstrapGas = 2000000
  } else {
    BLOCK_GAS_LIMIT = limit
    bootstrapGas = 1700000
  }

  if (options.verbose) {
    console.log(
      `Deploying with gasPrice ${ethers.utils.formatUnits(
        options.gasPrice.toString(),
        'gwei'
      )} gwei and limit of ${BLOCK_GAS_LIMIT}/${limit} gas`
    )
  }
  // ### Bootstrap Transaction Data
  const nicksTx = nick.decorateTx(
    nick.generateTx(
      EcoBootstrapArtifact.bytecode,
      '0xec0ec0ec0ec0ec0ec0ec0ec0ec0ec0ec0ec0ec0ec0ec0ec0ec0ec0ec0ec0ec0',
      bootstrapGas,
      options.gasPrice,
      ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256'],
        [options.account, options.numPlaceholders]
      )
    )
  )

  if (!options.production) {
    if (options.verbose) {
      console.log('setting up ERC1820 Registry')
    }
    // empty code is 0x
    if ((await options.ethersProvider.getCode(ERC1820_REGISTRY)).length >= 2) {
      await (
        await options.signer.sendTransaction({
          to: '0xa990077c3205cbDf861e17Fa532eeB069cE9fF96',
          value: ethers.utils.parseEther('0.08'),
        })
      ).wait()
      await (
        await options.ethersProvider.sendTransaction(REGISTRY_DEPLOY_TX)
      ).wait()
    }
  }

  // Verify that the bootstrap deployment hasn't already been done
  if (options.verbose) {
    console.log('Checking for bootstrap transaction presence...')
  }
  const codeAtAddr = await options.ethersProvider.getCode(nicksTx.to)

  if (codeAtAddr === '0x' || codeAtAddr === '0x0') {
    if (options.verbose) {
      console.log('Running bootstrap transaction...')
    }

    // Fund the deployment account
    await (
      await options.signer.sendTransaction({
        to: nicksTx.from,
        value: options.gasPrice.mul(bootstrapGas),
      })
    ).wait()

    // Issue the pre-signed deployment transaction
    await (await options.ethersProvider.sendTransaction(nicksTx.raw)).wait()
    options.gasUsed = options.gasUsed.add(bootstrapGas)

    if (options.verbose) {
      console.log('Bootstrap success!')
    }
  } else if (options.verbose) {
    if (options.verbose) {
      console.log('Bootstrap stage already deployed')
    }
  }

  // Index the Bootstrap data in a readable way
  options.bootstrap = {}
  options.bootstrap.address = nicksTx.to
  options.bootstrap.source = nicksTx.from

  // Bootstrap Contract Interface
  const bootstrapInterface = new ethers.Contract(
    nicksTx.to,
    EcoBootstrapArtifact.abi,
    options.ethersProvider
  )

  options.bootstrap.placeholders = []
  for (let i = 0; i < options.numPlaceholders; i++) {
    /* eslint-disable no-await-in-loop */
    options.bootstrap.placeholders.push(
      await bootstrapInterface.placeholders(i)
    )
  }

  return options
}

// ### Stage 2
// Once the initial proxy addresses we deploy the token contracts. The first proxy is reserved
// for the future root Policy address and is given to the token contracts for future governance.
//
// Each currency contract (`ECO`, `ECOx`) is also hosted on a proxy. This allows all external
// integrations to have constant references that will always be able to host all the data, but
// still allow upgrades to the currency to be performed.
//
// To distribute the initial currency we deploy TokenInit. The currency contracts mint the initial
// supply to the distribution contract. From there, this stage calls to the distribution contracts
// using the processed initialECO and initialECOx data processed in parseFlags.
//
async function deployStage2(options) {
  const gasPrice = options.gasPrice

  if (options.verbose) {
    console.log(`Bootstrap contract address: ${options.bootstrap.address}`)
  }

  // name this proxy for ease of use
  const policyProxyAddress = (options.policyAddress =
    options.bootstrap.placeholders[0])

  const ecoPolicyMint = options.initialECO.findIndex(
    (val) => val.holder === ethers.constants.AddressZero
  )
  if (ecoPolicyMint >= 0) {
    if (options.verbose) {
      console.log(
        `Setting initialECO holder marked as ${options.initialECO[ecoPolicyMint].safe} with amount ${options.initialECO[ecoPolicyMint].balance} as the root policy address`
      )
    }
    options.initialECO[ecoPolicyMint].holder = policyProxyAddress
    if (
      options.initialECO.findIndex(
        (val) => val.holder === ethers.constants.AddressZero
      ) >= 0
    ) {
      // eslint-disable-next-line no-throw-literal
      throw 'too many zero address eco inputs'
    }
  }

  const ecoxPolicyMint = options.initialECOx.findIndex(
    (val) => val.holder === ethers.constants.AddressZero
  )
  if (ecoxPolicyMint >= 0) {
    if (options.verbose) {
      console.log(
        `Setting initialECO holder marked as ${options.initialECOx[ecoxPolicyMint].safe} with amount ${options.initialECOx[ecoxPolicyMint].balance} as the root policy address`
      )
    }
    options.initialECOx[ecoxPolicyMint].holder = policyProxyAddress
    if (
      options.initialECOx.findIndex(
        (val) => val.holder === ethers.constants.AddressZero
      ) >= 0
    ) {
      // eslint-disable-next-line no-throw-literal
      throw 'too many zero address ecox inputs'
    }
  }

  // other proxies used in this stage
  const ecoProxyAddress = (options.ecoAddress =
    options.bootstrap.placeholders[1])
  const ecoXProxyAddress = (options.ecoXAddress =
    options.bootstrap.placeholders[2])

  // contract factories used in this stage
  const tokenInitFactory = new ethers.ContractFactory(
    TokenInitArtifact.abi,
    TokenInitArtifact.bytecode,
    options.signer
  )
  const ecoFactory = new ethers.ContractFactory(
    ECOArtifact.abi,
    ECOArtifact.bytecode,
    options.signer
  )
  const ecoXFactory = new ethers.ContractFactory(
    ECOxArtifact.abi,
    ECOxArtifact.bytecode,
    options.signer
  )

  const ecoProxyStatus = await checkIsProxyBound(
    ecoProxyAddress,
    options.ethersProvider,
    options.verbose
  )
  const deployEco =
    !ecoProxyStatus.initialized && ecoProxyStatus.owner === options.account
  if (deployEco) {
    options.ecoInitializable = ecoProxyStatus.impl
  }

  const ecoXProxyStatus = await checkIsProxyBound(
    ecoXProxyAddress,
    options.ethersProvider,
    options.verbose
  )
  const deployEcoX =
    !ecoXProxyStatus.initialized && ecoXProxyStatus.owner === options.account
  if (deployEcoX) {
    options.ecoInitializable = ecoXProxyStatus.impl
  }

  // deploy the token initial distribution contracts
  let tokenInit
  // no need to repeat if tokens have all been minted
  const deployTokenInit = deployEco || deployEcoX
  if (deployTokenInit) {
    if (options.verbose) {
      console.log('deploying the initial token distribution contract...')
    }
    tokenInit = await tokenInitFactory.deploy({
      gasPrice,
    })
  } else {
    if (options.verbose) {
      console.log(
        'skipping token init deployment as ECO and ECOx are already deployed'
      )
    }
  }

  // Deploy the token contracts
  let ecoImpl
  if (deployEco) {
    if (options.verbose) {
      console.log('deploying the ECO implementation contract...')
    }
    ecoImpl = await ecoFactory.deploy(
      policyProxyAddress,
      tokenInit.address,
      options.initialECOSupply,
      options.pauser,
      { gasPrice }
    )
  } else {
    if (options.verbose) {
      console.log('skipping ECO impl deployment')
    }
    ecoImpl = ecoProxyStatus.impl
  }

  let ecoXImpl
  if (deployEcoX) {
    if (options.verbose) {
      console.log('deploying the ECOx implementation contract...')
    }
    ecoXImpl = await ecoXFactory.deploy(
      policyProxyAddress,
      tokenInit.address,
      options.initialECOxSupply,
      ecoProxyAddress,
      options.pauser,
      { gasPrice }
    )
  } else {
    if (options.verbose) {
      console.log('skipping ECOx impl deployment')
    }
    ecoXImpl = ecoXProxyStatus.impl
  }

  if (options.verbose) {
    console.log('waiting for deploy transactions to be mined before binding...')
  }

  if (deployTokenInit) {
    const receipt = await tokenInit.deployTransaction.wait()
    options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  }
  if (deployEco) {
    const receipt = await ecoImpl.deployTransaction.wait()
    options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  }
  if (deployEcoX) {
    const receipt = await ecoXImpl.deployTransaction.wait()
    options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  }

  // bind proxies
  let ecoProxyFuseTx
  if (deployEco) {
    if (options.verbose) {
      console.log(
        'binding proxy 1 to the ECO token contract...',
        ecoProxyAddress,
        ecoImpl.address
      )
    }
    const ecoProxy = new ethers.Contract(
      ecoProxyAddress,
      EcoInitializableArtifact.abi,
      options.signer
    )

    ecoProxyFuseTx = await ecoProxy.fuseImplementation(ecoImpl.address, {
      gasPrice,
    })
  } else {
    if (options.verbose) {
      console.log('ECO proxy already fused')
    }
  }

  let ecoXProxyFuseTx
  if (deployEcoX) {
    if (options.verbose) {
      console.log(
        'binding proxy 2 to the ECOx token contract...',
        ecoXProxyAddress,
        ecoXImpl.address
      )
    }
    const ecoXProxy = new ethers.Contract(
      ecoXProxyAddress,
      EcoInitializableArtifact.abi,
      options.signer
    )

    ecoXProxyFuseTx = await ecoXProxy.fuseImplementation(ecoXImpl.address, {
      gasPrice,
    })
  } else {
    if (options.verbose) {
      console.log('ECOx proxy already fused')
    }
  }

  if (options.verbose) {
    console.log('waiting for proxy binding transactions to be mined...')
  }
  if (deployEco) {
    const receipt = await ecoProxyFuseTx.wait()
    options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  }
  if (deployEcoX) {
    const receipt = await ecoXProxyFuseTx.wait()
    options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  }

  let distributeEco = true
  if (!deployEco) {
    const ecoProxied = new ethers.Contract(
      ecoProxyAddress,
      ECOArtifact.abi,
      options.ethersProvider
    )
    const initAddress = await ecoProxied.distributor()
    const initEcoBalance = await ecoProxied.balanceOf(initAddress)
    if (initEcoBalance.eq(0)) {
      if (options.verbose) {
        console.log(
          'Init contract has 0 ECO balance, tokens either unminted or already distributed'
        )
      }
      distributeEco = false
    } else if (!initEcoBalance.eq(options.initialECOSupply)) {
      console.log(
        `${initAddress} only found to have a balance of ${initEcoBalance} weico, but asked to distribute ${options.initialECOSupply}`
      )
      console.log(
        'please review what ECO has already been distributed and adjust the input parameters.'
      )
      console.log('exiting...')
      throw new Error('ECO distribution mismatch', {
        initEcoBalance,
        initialECOSupply: options.initialECOSupply,
      })
    } else {
      if (options.verbose) {
        console.log('Init contract has the expected ECO, will distribute')
        options.initAddress = initAddress
      }
    }
  }

  let distributeEcoX = true
  if (!deployEcoX) {
    const ecoXProxied = new ethers.Contract(
      ecoXProxyAddress,
      ECOxArtifact.abi,
      options.ethersProvider
    )
    const initAddress = await ecoXProxied.distributor()
    const initEcoXBalance = await ecoXProxied.balanceOf(initAddress)
    if (initEcoXBalance.eq(0)) {
      if (options.verbose) {
        console.log(
          'Init contract has 0 ECOx balance, tokens either unminted or already distributed'
        )
      }
      distributeEcoX = false
    } else if (!initEcoXBalance.eq(options.initialECOxSupply)) {
      console.log(
        `${initAddress} only found to have a balance of ${initEcoXBalance} weico, but asked to distribute ${options.initialECOxSupply}`
      )
      console.log(
        'please review what ECOx has already been distributed and adjust the input parameters.'
      )
      console.log('exiting...')
      throw new Error('ECOx distribution mismatch', {
        initEcoXBalance,
        initialECOxSupply: options.initialECOxSupply,
      })
    } else {
      if (options.verbose) {
        console.log('Init contract has the expected ECOx, will distribute')
        options.initAddress = initAddress
      }
    }
  }

  // distribute the initial tokens
  let ecoDistributeTx
  if (distributeEco) {
    if (options.verbose) {
      console.log('distributing initial ECO...')
    }
    let tokenInitInstance
    if (!deployTokenInit) {
      if (options.verbose) {
        console.log('token init deploy was skipped, recreating object')
      }
      if (!options.initAddress) {
        console.log(
          'initAddress not collected in previous step, cannot distribute.'
        )
        console.log('exiting...')
        throw new Error('missing initAddress', {
          initAddress: options.initAddress,
          tokenInitPresence: !!tokenInit,
        })
      } else {
        tokenInitInstance = new ethers.Contract(
          options.initAddress,
          TokenInitArtifact.abi,
          options.signer
        )
      }
    } else {
      tokenInitInstance = tokenInit
    }
    ecoDistributeTx = await tokenInitInstance.distributeTokens(
      ecoProxyAddress,
      options.initialECO,
      {
        gasPrice,
        gasLimit: BLOCK_GAS_LIMIT,
      }
    )
  } else {
    if (options.verbose) {
      console.log('skipping ECO distribution, already distributed')
    }
  }

  let ecoXDistributeTx
  if (distributeEcoX) {
    if (options.verbose) {
      console.log('distributing initial ECOx...')
    }
    let tokenInitInstance
    if (!deployTokenInit) {
      if (options.verbose) {
        console.log('token init deploy was skipped, recreating object')
      }
      if (!options.initAddress) {
        console.log(
          'initAddress not collected in previous step, cannot distribute.'
        )
        console.log('exiting...')
        throw new Error('missing initAddress', {
          initAddress: options.initAddress,
          tokenInitPresence: !!tokenInit,
        })
      } else {
        tokenInitInstance = new ethers.Contract(
          options.initAddress,
          TokenInitArtifact.abi,
          options.signer
        )
      }
    } else {
      tokenInitInstance = tokenInit
    }
    ecoXDistributeTx = await tokenInitInstance.distributeTokens(
      ecoXProxyAddress,
      options.initialECOx,
      {
        gasPrice,
        gasLimit: BLOCK_GAS_LIMIT,
      }
    )
  } else {
    if (options.verbose) {
      console.log('skipping ECOx distribution, already distributed')
    }
  }

  if (options.verbose) {
    console.log(
      'waiting for distribution transactions to be mined before moving to the next stage...'
    )
  }
  if (distributeEco) {
    const receipt = await ecoDistributeTx.wait()
    options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  }
  if (distributeEcoX) {
    const receipt = await ecoXDistributeTx.wait()
    options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  }

  return options
}

// ### Stage 3
// Constructing the governance system is the most complicated step of the deployment
// process. Many of the contracts deployed here are templates that are cloned
// when they are needed by the generation stewarding contracts TimedPolicies and
// CurrencyTimer. These two contracts, along with the TrustedNodes contract and the
// root Policy contract itself are bound to proxies here.
//
// Template contracts deployed in this stage are: InflationRootHashProposal, Lockup,
// RandomInflation, CurrencyGovernance, PolicyProposals, and PolicyVotes
//
// Helper contracts deployed here are: VDFVerifier, and ECOxStaking
//
// The test-only contracts EcoFaucet and EcoTestCleanup are deployed here if the deploy
// is not a production-type deploy (i.e. for CI and local testing).
//
// The PolicyInit contract is deployed here (it is initially bound to the
// proxy for the root Policy). This contract is for assigning all the ERC1820 labels as
// well as denoting the priviledged labels. These identifier/address pairs are collected
// during this stage and then fusing that data to the policy contract (including pointing
// the proxy to the root Policy contract) is done in the PolicyInit contract at the end of
// this stage.
//

async function deployStage3(options) {
  const gasPrice = options.gasPrice

  // proxies that are already set
  const ecoAddress = options.ecoAddress
  const ecoXAddress = options.ecoXAddress

  // new proxies set during this deploy
  const policyProxyAddress = options.policyAddress
  const currencyTimerProxyAddress = (options.currencyTimerAddress =
    options.bootstrap.placeholders[3])
  const timedPoliciesProxyAddress = (options.timedPoliciesAddress =
    options.bootstrap.placeholders[4])
  const trustedNodesProxyAddress = (options.trustedNodesAddress =
    options.bootstrap.placeholders[5])

  // identifier hashes
  const ecoHash = ethers.utils.solidityKeccak256(['string'], ['ECO'])
  const ecoXHash = ethers.utils.solidityKeccak256(['string'], ['ECOx'])
  const ecoXStakingHash = ethers.utils.solidityKeccak256(
    ['string'],
    ['ECOxStaking']
  )
  const currencyTimerHash = ethers.utils.solidityKeccak256(
    ['string'],
    ['CurrencyTimer']
  )
  const timedPoliciesHash = ethers.utils.solidityKeccak256(
    ['string'],
    ['TimedPolicies']
  )
  const policyProposalsHash = ethers.utils.solidityKeccak256(
    ['string'],
    ['PolicyProposals']
  )
  const policyVotesHash = ethers.utils.solidityKeccak256(
    ['string'],
    ['PolicyVotes']
  )
  const trustedNodesHash = ethers.utils.solidityKeccak256(
    ['string'],
    ['TrustedNodes']
  )
  const faucetHash = ethers.utils.solidityKeccak256(['string'], ['Faucet'])

  // contract factories used in this stage (in order of appearance)
  const ecoXStakingFactory = new ethers.ContractFactory(
    ECOxStakingArtifact.abi,
    ECOxStakingArtifact.bytecode,
    options.signer
  )
  const rootHashFactory = new ethers.ContractFactory(
    RootHashProposalArtifact.abi,
    RootHashProposalArtifact.bytecode,
    options.signer
  )
  const vdfFactory = new ethers.ContractFactory(
    VDFVerifierArtifact.abi,
    VDFVerifierArtifact.bytecode,
    options.signer
  )
  const randomInflationFactory = new ethers.ContractFactory(
    RandomInflationArtifact.abi,
    RandomInflationArtifact.bytecode,
    options.signer
  )
  const lockupFactory = new ethers.ContractFactory(
    LockupArtifact.abi,
    LockupArtifact.bytecode,
    options.signer
  )
  const currencyGovernanceFactory = new ethers.ContractFactory(
    CurrencyGovernanceArtifact.abi,
    CurrencyGovernanceArtifact.bytecode,
    options.signer
  )
  const policyVotesFactory = new ethers.ContractFactory(
    PolicyVotesArtifact.abi,
    PolicyVotesArtifact.bytecode,
    options.signer
  )
  const policyProposalsFactory = new ethers.ContractFactory(
    PolicyProposalsArtifact.abi,
    PolicyProposalsArtifact.bytecode,
    options.signer
  )

  const policyFactory = new ethers.ContractFactory(
    options.correctPolicyArtifact.abi,
    options.correctPolicyArtifact.bytecode,
    options.signer
  )
  const policyInitFactory = new ethers.ContractFactory(
    PolicyInitArtifact.abi,
    PolicyInitArtifact.bytecode,
    options.signer
  )
  const currencyTimerFactory = new ethers.ContractFactory(
    CurrencyTimerArtifact.abi,
    CurrencyTimerArtifact.bytecode,
    options.signer
  )
  const timedPoliciesFactory = new ethers.ContractFactory(
    TimedPoliciesArtifact.abi,
    TimedPoliciesArtifact.bytecode,
    options.signer
  )
  const trustedNodesFactory = new ethers.ContractFactory(
    TrustedNodesArtifact.abi,
    TrustedNodesArtifact.bytecode,
    options.signer
  )

  const faucetFactory = new ethers.ContractFactory(
    FaucetArtifact.abi,
    FaucetArtifact.bytecode,
    options.signer
  )

  // begin deployment

  // first the secondary contracts are deployed to get their addresses
  // If this is not going to production, deploy the faucet
  let faucet
  if (!options.production) {
    if (options.verbose) {
      console.log('deploying the faucet policy contract...')
    }
    faucet = await faucetFactory.deploy(policyProxyAddress, { gasPrice })
  }

  // Deploy the ECOxStaking contract for voting
  if (options.verbose) {
    console.log('deploying the ECOx staking contract...')
  }
  const ecoXStaking = await ecoXStakingFactory.deploy(
    policyProxyAddress,
    ecoXAddress,
    { gasPrice }
  )

  // deploy the template contracts for cloning in the governance process
  if (options.verbose) {
    console.log('deploying governance template contracts...')
  }
  const rootHashProposalImpl = await rootHashFactory.deploy(
    policyProxyAddress,
    ecoAddress,
    { gasPrice }
  )

  const vdfImpl = await vdfFactory.deploy(policyProxyAddress, { gasPrice })

  const randomInflationImpl = await randomInflationFactory.deploy(
    policyProxyAddress,
    vdfImpl.address,
    options.randomVDFDifficulty,
    rootHashProposalImpl.address,
    ecoAddress,
    { gasPrice }
  )

  const lockupImpl = await lockupFactory.deploy(
    policyProxyAddress,
    ecoAddress,
    currencyTimerProxyAddress,
    { gasPrice }
  )

  const currencyGovernanceImpl = await currencyGovernanceFactory.deploy(
    policyProxyAddress,
    options.pauser,
    { gasPrice }
  )

  const policyVotesImpl = await policyVotesFactory.deploy(
    policyProxyAddress,
    ecoAddress,
    { gasPrice }
  )

  const policyProposalsImpl = await policyProposalsFactory.deploy(
    policyProxyAddress,
    policyVotesImpl.address,
    ecoAddress,
    { gasPrice }
  )

  // Deploy the core contracts that are proxy hosted
  if (options.verbose) {
    console.log('deploying the policy implementation contract...')
  }
  const policyImpl = await policyFactory.deploy({ gasPrice })

  if (options.verbose) {
    console.log('deploying policy initialization contract...')
  }
  const policyInit = await policyInitFactory.deploy({ gasPrice })

  if (options.verbose) {
    console.log('deploying the currency timer implementation contract...')
  }
  const currencyTimerImpl = await currencyTimerFactory.deploy(
    policyProxyAddress,
    currencyGovernanceImpl.address,
    randomInflationImpl.address,
    lockupImpl.address,
    ecoAddress,
    { gasPrice }
  )

  if (options.verbose) {
    console.log('deploying the timed actions implementation contract...')
  }
  const timedPoliciesImpl = await timedPoliciesFactory.deploy(
    policyProxyAddress,
    policyProposalsImpl.address,
    [ecoHash, currencyTimerHash], // THE ORDER OF THESE IS VERY IMPORTANT
    { gasPrice }
  )

  if (options.verbose) {
    console.log('deploying the trustee implementation contract...')
    console.log('trusted addresses:', options.trustedNodes)
    console.log(
      'ECOx voting reward for trusted addresses, in ECOx wei:',
      options.trusteeVoteReward
    )
  }
  const trustedNodesImpl = await trustedNodesFactory.deploy(
    policyProxyAddress,
    options.trustedNodes,
    options.trusteeVoteReward,
    { gasPrice }
  )

  if (options.verbose) {
    console.log(
      'waiting for contracts to finish deploying before binding proxies...'
    )
  }
  process.stdout.write('Progress: [             ]\r')
  let receipt = await ecoXStaking.deployTransaction.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  process.stdout.write('Progress: [x            ]\r')
  receipt = await rootHashProposalImpl.deployTransaction.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  process.stdout.write('Progress: [xx           ]\r')
  receipt = await vdfImpl.deployTransaction.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  process.stdout.write('Progress: [xxx          ]\r')
  receipt = await randomInflationImpl.deployTransaction.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  process.stdout.write('Progress: [xxxx         ]\r')
  receipt = await lockupImpl.deployTransaction.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  process.stdout.write('Progress: [xxxxx        ]\r')
  receipt = await currencyGovernanceImpl.deployTransaction.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  process.stdout.write('Progress: [xxxxxx       ]\r')
  receipt = await policyVotesImpl.deployTransaction.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  process.stdout.write('Progress: [xxxxxxx      ]\r')
  receipt = await policyProposalsImpl.deployTransaction.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  process.stdout.write('Progress: [xxxxxxxx     ]\r')
  receipt = await policyImpl.deployTransaction.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  process.stdout.write('Progress: [xxxxxxxxx    ]\r')
  receipt = await policyInit.deployTransaction.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  process.stdout.write('Progress: [xxxxxxxxxx   ]\r')
  receipt = await currencyTimerImpl.deployTransaction.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  process.stdout.write('Progress: [xxxxxxxxxxx  ]\r')
  receipt = await timedPoliciesImpl.deployTransaction.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  process.stdout.write('Progress: [xxxxxxxxxxxx ]\r')
  receipt = await trustedNodesImpl.deployTransaction.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  process.stdout.write('Progress: [xxxxxxxxxxxxx]\n')

  // Update the proxy targets to the implementation contract addresses
  if (options.verbose) {
    console.log(
      'binding proxy 0 to policy initialization contract...',
      policyProxyAddress,
      policyInit.address
    )
  }
  const policyInitProxy = new ethers.Contract(
    policyProxyAddress,
    EcoInitializableArtifact.abi,
    options.signer
  )
  const policyInitFuseTx = await policyInitProxy.fuseImplementation(
    policyInit.address,
    { gasPrice }
  )

  if (options.verbose) {
    console.log(
      'binding proxy 3 to the CurrencyTimer implementation contract...',
      currencyTimerProxyAddress,
      currencyTimerImpl.address
    )
  }
  const currencyTimerProxy = new ethers.Contract(
    currencyTimerProxyAddress,
    EcoInitializableArtifact.abi,
    options.signer
  )
  const currencyTimerFuseTx = await currencyTimerProxy.fuseImplementation(
    currencyTimerImpl.address,
    {
      gasPrice,
    }
  )

  // Update the proxy targets to the implementation contract addresses
  if (options.verbose) {
    console.log(
      'binding proxy 4 to the TimedPolicies implementation contract...',
      timedPoliciesProxyAddress,
      timedPoliciesImpl.address
    )
  }
  const timedPoliciesProxy = new ethers.Contract(
    timedPoliciesProxyAddress,
    EcoInitializableArtifact.abi,
    options.signer
  )
  const timedPoliciesFuseTx = await timedPoliciesProxy.fuseImplementation(
    timedPoliciesImpl.address,
    {
      gasPrice,
    }
  )

  if (options.verbose) {
    console.log(
      'binding proxy 5 to trusted nodes contract...',
      trustedNodesProxyAddress,
      trustedNodesImpl.address
    )
  }
  const trustedNodesProxy = new ethers.Contract(
    trustedNodesProxyAddress,
    EcoInitializableArtifact.abi,
    options.signer
  )
  const trustedNodesFuseTx = await trustedNodesProxy.fuseImplementation(
    trustedNodesImpl.address,
    {
      gasPrice,
    }
  )

  // policy init inputs
  const identifiers = [
    ecoHash,
    ecoXHash,
    ecoXStakingHash,
    currencyTimerHash,
    timedPoliciesHash,
    trustedNodesHash,
  ]
  const addresses = [
    ecoAddress,
    ecoXAddress,
    ecoXStaking.address,
    currencyTimerProxyAddress,
    timedPoliciesProxyAddress,
    trustedNodesProxyAddress,
  ]

  const setters = [
    currencyTimerHash,
    timedPoliciesHash,
    policyProposalsHash,
    policyVotesHash,
  ]

  if (!options.production) {
    identifiers.push(faucetHash)
    addresses.push(faucet.address)
    options.faucetAddress = faucet.address
  }

  // Initialize the policy structure and prevent any further changes
  if (options.verbose) {
    console.log('fusing policy initializer...')
  }
  // policy init must have fused to proxy already
  receipt = await policyInitFuseTx.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)

  const policyInitProxied = new ethers.Contract(
    policyProxyAddress,
    PolicyInitArtifact.abi,
    options.signer
  )

  const policyFuseTx = await policyInitProxied.fusedInit(
    policyImpl.address,
    setters,
    identifiers,
    addresses,
    { gasPrice, gasLimit: BLOCK_GAS_LIMIT }
  )

  // store relevant addresses in options for output
  options.ecoXStakingAddress = ecoXStaking.address
  options.rootHashProposalAddress = rootHashProposalImpl.address
  options.vdfAddress = vdfImpl.address
  options.randomInflationAddress = randomInflationImpl.address
  options.lockupAddress = lockupImpl.address
  options.currencyGovernanceAddress = currencyGovernanceImpl.address
  options.policyVotesAddress = policyVotesImpl.address
  options.policyProposalsAddress = policyProposalsImpl.address

  if (options.verbose) {
    console.log(
      'waiting for all transactions to be mined before moving to the next stage...'
    )
  }
  receipt = await currencyTimerFuseTx.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  receipt = await timedPoliciesFuseTx.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  receipt = await trustedNodesFuseTx.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  receipt = await policyFuseTx.wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)

  if (!options.production) {
    receipt = await faucet.deployTransaction.wait()
    options.gasUsed = receipt.gasUsed.add(options.gasUsed)
  }

  return options
}

// ### Stage 4
// Now that everything is in place, we increment the first generation
// which starts the governance cycle.
//
async function deployStage4(options) {
  if (options.verbose) {
    console.log('Incrementing initial generation')
  }
  const timedPoliciesProxied = new ethers.Contract(
    options.timedPoliciesAddress,
    TimedPoliciesArtifact.abi,
    options.signer
  )

  const receipt = await (
    await timedPoliciesProxied.incrementGeneration({
      gasPrice: options.gasPrice,
      gasLimit: BLOCK_GAS_LIMIT,
    })
  ).wait()
  options.gasUsed = receipt.gasUsed.add(options.gasUsed)

  return options
}

async function deploy(deploymentOptions) {
  return parseFlags(deploymentOptions)
    .then(deployStage1)
    .then(deployStage2)
    .then(deployStage3)
    .then(deployStage4)
}

async function deployTokens(tokenOptions) {
  const options = await parseFlags(tokenOptions)
    .then(deployStage1)
    .then(deployStage2)
  if (options.verbose) {
    console.log(`Gas used for token deploy: ${options.gasUsed.toString()}`)
    console.log(
      `Ether used in gas: ${ethers.utils.formatEther(
        options.gasUsed.mul(options.gasPrice).toString()
      )}`
    )
  }
  return options
}

async function deployGovernance(carryoverOptions) {
  const options = await parseFlags(carryoverOptions)
    .then(deployStage3)
    .then(deployStage4)
  if (options.verbose) {
    console.log(`Gas used for governance deploy: ${options.gasUsed.toString()}`)
    console.log(
      `Ether used in gas: ${ethers.utils.formatEther(
        options.gasUsed.mul(options.gasPrice).toString()
      )}`
    )
  }
  return options
}

module.exports = {
  deploy,
  deployTokens,
  deployGovernance,
}
