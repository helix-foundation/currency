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
 * trustednodes: the list of addresses to be the initial trustees
 * trusteeVoteReward: a stringified number for the amount of ECOx awarded to trustees on each vote
 * production: boolean flag for if the deploy is to chain or should include test contracts
 * verbose: boolean flag for logging, production overrides this and is always verbose
 * initialECO: an array of { address; amount } objects for initial ECO distribution
 * initialECOx: same as initialECO but for ECOx
 */

// ## Dependencies
const nick = require('./nicks')
const ethers = require('ethers')

let BLOCK_GAS_LIMIT = 6000000

// ### Contract ABIs and Bytecode
/* eslint-disable import/no-unresolved, import/no-dynamic-require */
const PolicyABI = require(`../artifacts/contracts/policy/Policy.sol/Policy.json`)
const PolicyTestABI = require(`../artifacts/contracts/test/Backdoor.sol/PolicyTest.json`)
const PolicyInitABI = require(`../artifacts/contracts/policy/PolicyInit.sol/PolicyInit.json`)
const EcoBootstrapABI = require(`../artifacts/contracts/deploy/EcoBootstrap.sol/EcoBootstrap.json`)
const EcoInitializableABI = require(`../artifacts/contracts/deploy/EcoInitializable.sol/EcoInitializable.json`)
const TimedPoliciesABI = require(`../artifacts/contracts/governance/TimedPolicies.sol/TimedPolicies.json`)
const TrustedNodesABI = require(`../artifacts/contracts/governance/monetary/TrustedNodes.sol/TrustedNodes.json`)
const rootHashProposalABI = require(`../artifacts/contracts/governance/monetary/InflationRootHashProposal.sol/InflationRootHashProposal.json`)
const InflationContractABI = require(`../artifacts/contracts/governance/monetary/RandomInflation.sol/RandomInflation.json`)
const CurrencyGovernanceABI = require(`../artifacts/contracts/governance/monetary/CurrencyGovernance.sol/CurrencyGovernance.json`)
const CurrencyTimerContractABI = require(`../artifacts/contracts/governance/CurrencyTimer.sol/CurrencyTimer.json`)
const LockupContractABI = require(`../artifacts/contracts/governance/monetary/Lockup.sol/Lockup.json`)
const PolicyProposalContractABI = require(`../artifacts/contracts/governance/community/PolicyProposals.sol/PolicyProposals.json`)
const PolicyVotesContractABI = require(`../artifacts/contracts/governance/community/PolicyVotes.sol/PolicyVotes.json`)
const ECOxStakingContractABI = require(`../artifacts/contracts/governance/community/ECOxStaking.sol/ECOxStaking.json`)
const ECOABI = require(`../artifacts/contracts/currency/ECO.sol/ECO.json`)
const EcoFaucetABI = require(`../artifacts/contracts/deploy/EcoFaucet.sol/EcoFaucet.json`)
const EcoTestCleanupABI = require(`../artifacts/contracts/deploy/EcoTestCleanup.sol/EcoTestCleanup.json`)
const TokenInitABI = require(`../artifacts/contracts/currency/TokenInit.sol/TokenInit.json`)
const VDFVerifierABI = require(`../artifacts/contracts/VDF/VDFVerifier.sol/VDFVerifier.json`)
const ECOxABI = require(`../artifacts/contracts/currency/ECOx.sol/ECOx.json`)
/* eslint-enable import/no-unresolved */

async function parseFlags(options) {
  // we currently require 6 proxies for deployment
  options.numPlaceholders = '6'

  if (!options.gasMultiplier) {
    options.gasMultiplier = 5
  }

  if (!options.gasPrice) {
    options.gasPrice = (await options.signer.getGasPrice())
      .mul(options.gasMultiplier)
  } else {
    options.gasPrice = ethers.BigNumber.from(options.gasPrice)
  }

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
    options.correctPolicyABI = PolicyABI
  } else {
    if (options.verbose) {
      console.log('This is a test, using the testing policy.')
    }
    options.correctPolicyABI = PolicyTestABI
  }

  if (options.initialECO) {
    options.initialECOSupply = options.initialECO.map(
      (initial) => initial.balance
    ).reduce((a, b) =>
      ethers.BigNumber.from(a).add(ethers.BigNumber.from(b)).toString()
    )
  }
  if (options.initialECOx) {
    options.initialECOxSupply = options.initialECOx.map(
      (initial) => initial.balance
    ).reduce((a, b) =>
      ethers.BigNumber.from(a).add(ethers.BigNumber.from(b)).toString()
    )
  }

  // set CI parameters for automated tests
  if (options.test) {
    options.randomVDFDifficulty = 3
    options.initialECOSupply = '0'
    options.initialECOAddr = []
    options.initialECOAmount = []
    options.initialECOxSupply = '1000000000000000000000'
    options.initialECOxAddr = [options.account]
    options.initialECOxAmount = [options.initialECOxSupply]
    options.trusteeVoteReward = options.trusteeVoteReward || '1000'
  }

  return options
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
    bootstrapGas = 1526410
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
  const nicksTx = 
    nick.decorateTx(
      nick.generateTx(
        EcoBootstrapABI.bytecode,
        '0x1234',
        bootstrapGas,
        options.gasPrice,
        ethers.utils.defaultAbiCoder.encode(
          ['address', 'uint8'],
          [options.account, options.numPlaceholders]
        )
      )
    )
  
  if (options.verbose) {
    console.log('setting up ERC1820 Registry')
  }
  {
    /* eslint-disable global-require */
    require('@openzeppelin/test-helpers/configure')()
    const { singletons } = require('@openzeppelin/test-helpers')
    await singletons.ERC1820Registry(options.chumpAccount)
  }

  // Verify that the bootstrap deployment hasn't already been done
  if (options.verbose) {
    console.log('Checking for bootstrap transaction presence...')
  }
  const codeAtAddr = await options.ethersProvider.getCode(nicksTx.to)

  if (codeAtAddr === '0x' || codeAtAddr === '0x0') {
    // Fund the deployment account
    if (options.verbose) {
      console.log('Running bootstrap transaction...')
    }
    await (await options.signer.sendTransaction({
      to: nicksTx.from,
      value: options.gasPrice.mul(bootstrapGas),
    })).wait()

    // Issue the pre-signed deployment transaction
    await (await options.ethersProvider.sendTransaction(nicksTx.raw)).wait()

    console.log('Bootstrap success!')
  } else if (options.verbose) {
    console.log('Bootstrap stage already deployed')
  }

  // Index the Bootstrap data in a readable way
  options.bootstrap = {}
  options.bootstrap.address = nicksTx.to
  options.bootstrap.source = nicksTx.from

  // Bootstrap Contract Interface
  const bootstrapInterface = new ethers.Contract(
    nicksTx.to,
    EcoBootstrapABI.abi,
    options.ethersProvider,
  )

  options.bootstrap.placeholders = []
  for (let i = 0; i < options.numPlaceholders; i++) {
    /* eslint-disable no-await-in-loop */
    options.bootstrap.placeholders.push(
      await bootstrapInterface.connect(options.signer)
        .placeholders(i)
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
  if (options.verbose) {
    console.log(`Bootstrap contract address: ${options.bootstrap.address}`)
  }

  // save these two proxies for later
  options.policyProxyAddress = options.bootstrap.placeholders[0]

  const ecoProxyAddress = options.bootstrap.placeholders[1]
  const ecoxProxyAddress = options.bootstrap.placeholders[2]

  // deploy the token initial distribution contracts
  if (options.verbose) {
    console.log('deploying the initial token distribution contract...')
  }
  const tokenInit = await new web3.eth.Contract(TokenInitABI.abi)
    .deploy({
      data: TokenInitABI.bytecode,
      arguments: [],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })

  // Deploy the token contracts
  if (options.verbose) {
    console.log('deploying the ECO implementation contract...')
  }
  const ecoImpl = await new web3.eth.Contract(ECOABI.abi)
    .deploy({
      data: ECOABI.bytecode,
      arguments: [
        options.policyProxyAddress,
        tokenInit.options.address,
        options.initialECOSupply,
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })

  if (options.verbose) {
    console.log('deploying the ECOx implementation contract...')
  }
  const ecoxImpl = await new web3.eth.Contract(ECOxABI.abi)
    .deploy({
      data: ECOxABI.bytecode,
      arguments: [
        options.policyProxyAddress,
        tokenInit.options.address,
        options.initialECOxSupply,
        ecoProxyAddress,
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })

  // bind proxies
  if (options.verbose) {
    console.log(
      'binding proxy 1 to the ECO token contract...',
      ecoProxyAddress,
      ecoImpl.options.address
    )
  }
  try {
    await new web3.eth.Contract(
      EcoInitializableABI.abi,
      ecoProxyAddress
    ).methods['fuseImplementation(address)'](ecoImpl.options.address).send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  } catch (error) {
    console.log('proxy 1 already bound')
  }

  if (options.verbose) {
    console.log(
      'binding proxy 2 to the ECOx token contract...',
      ecoxProxyAddress,
      ecoxImpl.options.address
    )
  }
  try {
    await new web3.eth.Contract(
      EcoInitializableABI.abi,
      ecoxProxyAddress
    ).methods['fuseImplementation(address)'](ecoxImpl.options.address).send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  } catch (error) {
    console.log('proxy 2 already bound')
  }

  // distribute the initial tokens
  if (options.verbose) {
    console.log('distributing initial ECO...')
  }
  await tokenInit.methods
    .distributeTokens(ecoProxyAddress, options.initialECO)
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })

  if (options.verbose) {
    console.log('distributing initial ECOx...')
  }
  await tokenInit.methods
    .distributeTokens(ecoxProxyAddress, options.initialECOx)
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })

  // Pass along the deployed addresses
  const ecoAddress = new web3.eth.Contract(ECOABI.abi, ecoProxyAddress).options
    .address
  const ecoxAddress = new web3.eth.Contract(ECOxABI.abi, ecoxProxyAddress)
    .options.address

  options.eco = { options: { address: ecoAddress }, _address: ecoAddress }
  options.ecox = { options: { address: ecoxAddress }, _address: ecoxAddress }

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
  // Collect up the identifiers and addresses to be used in the policy structure
  const setters = []
  const identifiers = []
  const addresses = []

  const ecoProxyAddress = options.bootstrap.placeholders[1]
  const ecoxProxyAddress = options.bootstrap.placeholders[2]
  const currencyTimerProxyAddress = options.bootstrap.placeholders[3]

  if (options.verbose) {
    console.log('deploying policy initialization contract...')
  }
  const policyInit = await new web3.eth.Contract(PolicyInitABI.abi)
    .deploy({
      data: PolicyInitABI.bytecode,
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })

  if (options.verbose) {
    console.log(
      'binding proxy 0 to policy initialization contract...',
      options.policyProxyAddress,
      policyInit.options.address
    )
  }

  const ecoInitPolicyProxy = new web3.eth.Contract(
    EcoInitializableABI.abi,
    options.policyProxyAddress
  )
  try {
    await ecoInitPolicyProxy.methods['fuseImplementation(address)'](
      policyInit.options.address
    ).send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  } catch (error) {
    console.log('proxy 0 already bound')
  }

  options.policyProxy = new web3.eth.Contract(
    options.correctPolicyABI.abi,
    options.policyProxyAddress
  )

  // Deploy the root hash
  if (options.verbose) {
    console.log('deploying Root Hash...')
  }
  const rootHashProposalImpl = await new web3.eth.Contract(
    rootHashProposalABI.abi
  )
    .deploy({
      data: rootHashProposalABI.bytecode,
      arguments: [options.policyProxy.options.address, ecoProxyAddress],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  options.rootHashProposal = rootHashProposalImpl

  // deploy the helper contracts for the policy
  if (options.verbose) {
    console.log('deploying policy helper contracts...')
  }
  const vdfContract = await new web3.eth.Contract(VDFVerifierABI.abi)
    .deploy({
      data: VDFVerifierABI.bytecode,
      arguments: [options.policyProxy.options.address],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  options.vdfContract = vdfContract

  const depositCertificatesContract = await new web3.eth.Contract(
    LockupContractABI.abi
  )
    .deploy({
      data: LockupContractABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
        ecoProxyAddress,
        currencyTimerProxyAddress,
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  options.depositCertificatesContract = depositCertificatesContract
  const inflationContract = await new web3.eth.Contract(
    InflationContractABI.abi
  )
    .deploy({
      data: InflationContractABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
        options.vdfContract.options.address,
        options.randomVDFDifficulty,
        options.rootHashProposal.options.address,
        ecoProxyAddress,
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })

  options.inflationContract = inflationContract

  const governanceContract = await new web3.eth.Contract(
    CurrencyGovernanceABI.abi
  )
    .deploy({
      data: CurrencyGovernanceABI.bytecode,
      arguments: [options.policyProxy.options.address],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  options.governanceContract = governanceContract

  const policyVotesContract = await new web3.eth.Contract(
    PolicyVotesContractABI.abi
  )
    .deploy({
      data: PolicyVotesContractABI.bytecode,
      arguments: [options.policyProxy.options.address, ecoProxyAddress],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  options.policyVotesContract = policyVotesContract

  const policyProposalContract = await new web3.eth.Contract(
    PolicyProposalContractABI.abi
  )
    .deploy({
      data: PolicyProposalContractABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
        options.policyVotesContract.options.address,
        ecoProxyAddress,
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  options.policyProposalContract = policyProposalContract

  // Deploy the ECOxStaking contract for voting
  const ecoXStakingContract = await new web3.eth.Contract(
    ECOxStakingContractABI.abi
  )
    .deploy({
      data: ECOxStakingContractABI.bytecode,
      arguments: [options.policyProxy.options.address, ecoxProxyAddress],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  options.ecoXStakingContract = ecoXStakingContract
  const ecoXStakingIdentifierHash = web3.utils.soliditySha3('ECOxStaking')
  identifiers.push(ecoXStakingIdentifierHash)
  addresses.push(ecoXStakingContract.options.address)

  // Deploy the currency timer
  if (options.verbose) {
    console.log('deploying the currency timer contract...')
  }
  const currencyTimerHash = web3.utils.soliditySha3('CurrencyTimer')
  const currencyTimerImpl = await new web3.eth.Contract(
    CurrencyTimerContractABI.abi
  )
    .deploy({
      data: CurrencyTimerContractABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
        options.governanceContract.options.address,
        options.inflationContract.options.address,
        options.depositCertificatesContract.options.address,
        ecoProxyAddress,
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  options.currencyTimerImpl = currencyTimerImpl

  // Update the proxy targets to the implementation contract addresses
  if (options.verbose) {
    console.log(
      'binding proxy 3 to the CurrencyTimer implementation contract...',
      currencyTimerProxyAddress,
      options.currencyTimerImpl.options.address
    )
  }
  try {
    await new web3.eth.Contract(
      EcoInitializableABI.abi,
      currencyTimerProxyAddress
    ).methods['fuseImplementation(address)'](
      currencyTimerImpl.options.address
    ).send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  } catch (error) {
    console.log('proxy 3 already bound')
  }
  options.currencyTimer = new web3.eth.Contract(
    CurrencyTimerContractABI.abi,
    currencyTimerProxyAddress
  )

  identifiers.push(currencyTimerHash)
  setters.push(currencyTimerHash)
  addresses.push(currencyTimerProxyAddress)

  // Deploy the voting policy contract
  if (options.verbose) {
    console.log('deploying the timed actions contract...')
  }
  const ecoHash = web3.utils.soliditySha3('ECO')
  const timedPoliciesImpl = await new web3.eth.Contract(TimedPoliciesABI.abi)
    .deploy({
      data: TimedPoliciesABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
        options.policyProposalContract.options.address,
        [ecoHash, currencyTimerHash],
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  // Update the proxy targets to the implementation contract addresses
  const timedPoliciesProxyAddress = options.bootstrap.placeholders[4]
  if (options.verbose) {
    console.log(
      'binding proxy 4 to the TimedPolicies implementation contract...',
      currencyTimerProxyAddress,
      options.currencyTimerImpl.options.address
    )
  }
  const timedPoliciesIdentifierHash = web3.utils.soliditySha3('TimedPolicies')
  const policyProposalsIdentifierHash =
    web3.utils.soliditySha3('PolicyProposals')
  const policyVotesIdentifierHash = web3.utils.soliditySha3('PolicyVotes')
  try {
    await new web3.eth.Contract(
      EcoInitializableABI.abi,
      timedPoliciesProxyAddress
    ).methods['fuseImplementation(address)'](
      timedPoliciesImpl.options.address
    ).send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  } catch (error) {
    console.log('proxy 4 already bound')
  }
  options.timedPolicies = new web3.eth.Contract(
    TimedPoliciesABI.abi,
    timedPoliciesProxyAddress
  )

  identifiers.push(timedPoliciesIdentifierHash)
  setters.push(timedPoliciesIdentifierHash)
  addresses.push(timedPoliciesProxyAddress)

  // Deploy the policy implementation contract
  if (options.verbose) {
    console.log('deploying the policy implementation contract...')
  }
  const policyContract = await new web3.eth.Contract(
    options.correctPolicyABI.abi
  )
    .deploy({
      data: options.correctPolicyABI.bytecode,
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  options.policyContract = policyContract

  if (options.verbose) {
    console.log('deploying the TrustedNodes policy contract...')
    console.log('trusted addresses:', options.trustednodes)
    console.log(
      'ecox voting reward for trusted addresses:',
      options.trusteeVoteReward
    )
  }
  const trustedNodesImpl = await new web3.eth.Contract(TrustedNodesABI.abi)
    .deploy({
      data: TrustedNodesABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
        options.trustednodes,
        options.trusteeVoteReward,
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  options.trustedNodesImpl = trustedNodesImpl
  const trustedNodesProxyAddress = options.bootstrap.placeholders[5]
  if (options.verbose) {
    console.log(
      'binding proxy 5 to trusted nodes contract...',
      trustedNodesProxyAddress,
      trustedNodesImpl.options.address
    )
  }
  try {
    await new web3.eth.Contract(
      EcoInitializableABI.abi,
      trustedNodesProxyAddress
    ).methods['fuseImplementation(address)'](
      trustedNodesImpl.options.address
    ).send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
  } catch (error) {
    console.log('proxy 5 already bound')
  }
  options.trustedNodes = new web3.eth.Contract(
    TrustedNodesABI.abi,
    trustedNodesProxyAddress
  )
  identifiers.push(web3.utils.soliditySha3('TrustedNodes'))
  addresses.push(trustedNodesProxyAddress)

  // If this is not going to production, deploy the cleanup contract and the faucet
  if (!options.production) {
    if (options.verbose) {
      console.log('deploying the cleanup policy contract...')
    }
    const cleanupContract = await new web3.eth.Contract(EcoTestCleanupABI.abi)
      .deploy({
        data: EcoTestCleanupABI.bytecode,
        arguments: [options.policyProxy.options.address],
      })
      .send({
        from: options.account,
        gas: BLOCK_GAS_LIMIT,
        gasPrice: options.gasPrice,
      })
    identifiers.push(web3.utils.soliditySha3('Cleanup'))
    setters.push(web3.utils.soliditySha3('Cleanup'))
    addresses.push(cleanupContract.options.address)
    options.cleanupContract = cleanupContract

    if (options.verbose) {
      console.log('deploying the faucet policy contract...')
    }
    const faucetContract = await new web3.eth.Contract(EcoFaucetABI.abi)
      .deploy({
        data: EcoFaucetABI.bytecode,
        arguments: [options.policyProxy.options.address],
      })
      .send({
        from: options.account,
        gas: BLOCK_GAS_LIMIT,
        gasPrice: options.gasPrice,
      })
    identifiers.push(web3.utils.soliditySha3('Faucet'))
    addresses.push(faucetContract.options.address)
    options.faucetContract = faucetContract
  }

  // Add token interfaces and balance store to the ERC1820 interfaces lists for
  // our policy initialization action.
  identifiers.push(web3.utils.soliditySha3('ECO'))
  addresses.push(options.eco.options.address)

  identifiers.push(web3.utils.soliditySha3('ECOx'))
  addresses.push(options.ecox.options.address)

  setters.push(policyProposalsIdentifierHash, policyVotesIdentifierHash)
  // Initialize the policy structure and prevent any further changes
  if (options.verbose) {
    console.log('fusing policy initializer...')
  }
  const ecoInitPolicy = new web3.eth.Contract(
    PolicyInitABI.abi,
    options.policyProxy.options.address
  )

  await ecoInitPolicy.methods
    .fusedInit(
      policyContract.options.address,
      setters,
      identifiers,
      addresses
      // tokenResolvers,
    )
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    })
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
  await options.timedPolicies.methods.incrementGeneration().send({
    from: options.account,
    gas: BLOCK_GAS_LIMIT,
    gasPrice: options.gasPrice,
  })
  return options
}

function deploy(deploymentOptions) {
  return parseFlags(deploymentOptions)
    .then(deployStage1)
    .then(deployStage2)
    .then(deployStage3)
    .then(deployStage4)
}

function deployTokens(tokenOptions) {
  return parseFlags(tokenOptions).then(deployStage1).then(deployStage2)
}

function deployGovernance(carryoverOptions) {
  return parseFlags(carryoverOptions).then(deployStage3).then(deployStage4)
}

// ok, lets go with a pre-deploy and secondary deploy function.
module.exports = {
  deploy,
  deployTokens,
  deployGovernance,
}
