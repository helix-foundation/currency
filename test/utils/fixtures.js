/* eslint-disable no-param-reassign, no-console, camelcase */
const {
  ERC1820_REGISTRY,
  REGISTRY_DEPLOY_TX,
} = require('../../tools/constants')
const { deployFrom } = require('./contracts')

const ECOx_STAKING_HASH = ethers.utils.solidityKeccak256(
  ['string'],
  ['ECOxStaking']
)
const CURRENCY_TIMER_HASH = ethers.utils.solidityKeccak256(
  ['string'],
  ['CurrencyTimer']
)
const TIMED_POLICIES_HASH = ethers.utils.solidityKeccak256(
  ['string'],
  ['TimedPolicies']
)
const POLICY_PROPOSALS_HASH = ethers.utils.solidityKeccak256(
  ['string'],
  ['PolicyProposals']
)
const POLICY_VOTES_HASH = ethers.utils.solidityKeccak256(
  ['string'],
  ['PolicyVotes']
)
const TRUSTED_NODES_HASH = ethers.utils.solidityKeccak256(
  ['string'],
  ['TrustedNodes']
)
const ECO_HASH = ethers.utils.solidityKeccak256(['string'], ['ECO'])
const ECOx_HASH = ethers.utils.solidityKeccak256(['string'], ['ECOx'])
const FAUCET_HASH = ethers.utils.solidityKeccak256(['string'], ['Faucet'])

/**
 * Gets the initializable proxy slot at index
 */
async function getPlaceholder(bootstrap, index) {
  const placeholderAddress = await bootstrap.placeholders(index)
  return ethers.getContractAt('EcoInitializable', placeholderAddress)
}

/**
 * Binds a contract to the given proxy index
 */
async function bindProxy(bootstrap, contract, index) {
  const proxy = await getPlaceholder(bootstrap, index)
  const tx = await proxy.fuseImplementation(contract.address)
  await tx.wait()
  return proxy
}

/**
 * For ECO Init fusedInit
 */
function getSetters() {
  return [
    CURRENCY_TIMER_HASH,
    TIMED_POLICIES_HASH,
    POLICY_PROPOSALS_HASH,
    POLICY_VOTES_HASH,
  ]
}

/**
 * For ECO Init fusedInit
 */
function getIdentifiers() {
  return [
    ECOx_STAKING_HASH,
    CURRENCY_TIMER_HASH,
    TIMED_POLICIES_HASH,
    TRUSTED_NODES_HASH,
    FAUCET_HASH,
    ECO_HASH,
    ECOx_HASH,
  ]
}

/**
 * For ECO Init fusedInit
 */
function getAddresses(contracts) {
  return [
    contracts.ecoXStaking.address,
    contracts.currencyTimer.address,
    contracts.timedPolicies.address,
    contracts.trustedNodes.address,
    contracts.faucet.address,
    contracts.eco.address,
    contracts.ecox.address,
  ]
}

/**
 * Deploys required singletons to the chain if not already there
 */
exports.deploySingletons = async (from) => {
  if ((await ethers.provider.getCode(ERC1820_REGISTRY)).length > '0x0'.length) {
    return
  }

  await from.sendTransaction({
    to: '0xa990077c3205cbDf861e17Fa532eeB069cE9fF96',
    value: ethers.utils.parseEther('0.08'),
  })
  await ethers.provider.sendTransaction(REGISTRY_DEPLOY_TX)
}

exports.policyFor = async (policy, hash) => {
  const erc1820 = await ethers.getContractAt(
    'IERC1820Registry',
    '0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24'
  )
  return erc1820.getInterfaceImplementer(policy.address, hash)
}

exports.bootstrap = async (wallet, trustedNodes = [], voteReward = '1000') => {
  await exports.deploySingletons(wallet)

  // ### Stage 1
  // Deploy bootstrap contract
  const bootstrap = await deployFrom(
    wallet,
    'EcoBootstrap',
    await wallet.getAddress(),
    6
  )

  // ### Stage 2
  // Deploy PolicyProxy, ECO, and ECOx contracts
  //
  // ![Step 2 of Policy Setup](https://www.lucidchart.com/publicSegments/view/ddd05c82-5b4b-4742-9f37-666ffd318261/image.png)
  const policyInit = await deployFrom(wallet, 'PolicyInit')
  const policyProxy = await bindProxy(bootstrap, policyInit, 0)

  const coreContracts = await exports.deployCoreContracts(
    wallet,
    bootstrap,
    policyProxy
  )

  const { ecoImpl, ecoxImpl, tokenInit } = coreContracts

  const eco = await bindProxy(bootstrap, ecoImpl, 1)
  const ecox = await bindProxy(bootstrap, ecoxImpl, 2)

  // ### Stage 3
  // Constructing the policy set is the most complicated step of the deployment
  // process. Many of the contracts deployed here are templates that are cloned
  // when they are needed to help keep scope.
  // ![Step 3 of Policy Setup](https://www.lucidchart.com/publicSegments/view/8730274f-cb64-4605-b60c-5413723befba/image.png)
  const peripheralContracts = await exports.deployPeripheralContracts(
    wallet,
    bootstrap,
    trustedNodes,
    voteReward,
    policyProxy,
    Object.assign(coreContracts, { eco, ecox })
  )
  const { timedPolicies, policy } = peripheralContracts

  const policyProxyInit = await ethers.getContractAt(
    'PolicyInit',
    policyProxy.address
  )
  await policyProxyInit.fusedInit(
    policy.address,
    getSetters(),
    getIdentifiers(),
    getAddresses({
      ...coreContracts,
      ...peripheralContracts,
      eco,
      ecox,
    })
  )

  // distribute initial tokens
  // await tokenInit
  // .distributeTokens(eco.address, [await wallet.getAddress()], [ethers.utils.parseEther('10')]);
  await tokenInit.distributeTokens(ecox.address, [
    {
      holder: await wallet.getAddress(),
      balance: ethers.utils.parseEther('1000'),
    },
  ])

  // ### Stage 4
  // Here we mint some initial tokens. The initialization
  // contract self-destructs on first use to prevent any possible future run.
  //
  // Finally, now that everything is in place, we increment the first generation
  // which sends the code live to be used.
  //  await tokenInit.initializeAndFuse(eco.address);
  await timedPolicies.incrementGeneration()

  return {
    ...coreContracts,
    ...peripheralContracts,
    eco: await ethers.getContractAt('ECO', eco.address),
    ecox: await ethers.getContractAt('ECOx', ecox.address),
    policy: await ethers.getContractAt('PolicyTest', policyProxy.address),
  }
}

/**
 * Deploys the core contracts
 *  - InflationRootHashProposal
 *  - ECO implementation
 *  - ECOx implementation
 */
exports.deployCoreContracts = async (wallet, bootstrap, policyProxy) => {
  const ecoProxy = await getPlaceholder(bootstrap, 1)

  const _tokenInit = await deployFrom(wallet, 'TokenInit')

  const deployments = []
  deployments.push(
    deployFrom(wallet, 'ECO', policyProxy.address, _tokenInit.address, 0)
  )
  deployments.push(deployFrom(wallet, 'TokenInit'))
  const [ecoImpl, tokenInit] = await Promise.all(deployments)

  const initialECOxSupply = ethers.utils.parseEther('1000')
  const ecoxImpl = await deployFrom(
    wallet,
    'ECOx',
    policyProxy.address,
    tokenInit.address,
    initialECOxSupply,
    ecoProxy.address
  )

  return {
    ecoImpl,
    tokenInit,
    ecoxImpl,
  }
}

/**
 * Deploys the peripheral contracts
 *  - VDFVerifier
 *  - Lockup
 *  - Inflation
 *  - CurrencyGovernance
 *  - PolicyVotes
 *  - PolicyProposals
 *  - ECOxStaking
 *  - CurrencyTimer
 *  - TimedPolicies
 *  - Policy
 *  - TrustedNodes
 */
exports.deployPeripheralContracts = async (
  wallet,
  bootstrap,
  trustedNodesList,
  voteReward,
  policyProxy,
  coreContracts
) => {
  const { eco, ecox } = coreContracts

  const vdfVerifier = await deployFrom(
    wallet,
    'VDFVerifier',
    policyProxy.address
  )

  const rootHashProposal = await deployFrom(
    wallet,
    'InflationRootHashProposal',
    policyProxy.address,
    eco.address
  )

  const inflation = await deployFrom(
    wallet,
    'RandomInflation',
    policyProxy.address,
    vdfVerifier.address,
    3,
    rootHashProposal.address,
    eco.address
  )

  const currencyTimerProxy = await getPlaceholder(bootstrap, 3)

  const lockup = await deployFrom(
    wallet,
    'Lockup',
    policyProxy.address,
    eco.address,
    currencyTimerProxy.address
  )

  const governance = await deployFrom(
    wallet,
    'CurrencyGovernance',
    policyProxy.address
  )

  const policyVotes = await deployFrom(
    wallet,
    'PolicyVotes',
    policyProxy.address,
    eco.address
  )

  const policyProposals = await deployFrom(
    wallet,
    'PolicyProposals',
    policyProxy.address,
    policyVotes.address,
    eco.address
  )

  const ecoXStaking = await deployFrom(
    wallet,
    'ECOxStaking',
    policyProxy.address,
    ecox.address
  )

  const currencyTimerImpl = await deployFrom(
    wallet,
    'CurrencyTimer',
    policyProxy.address,
    governance.address,
    inflation.address,
    lockup.address,
    eco.address
  )
  await bindProxy(bootstrap, currencyTimerImpl, 3)
  const currencyTimer = await ethers.getContractAt(
    'CurrencyTimer',
    (
      await getPlaceholder(bootstrap, 3)
    ).address
  )

  const timedPoliciesImpl = await deployFrom(
    wallet,
    'TimedPolicies',
    policyProxy.address,
    policyProposals.address,
    [ECO_HASH, CURRENCY_TIMER_HASH]
  )
  await bindProxy(bootstrap, timedPoliciesImpl, 4)
  const timedPolicies = await ethers.getContractAt(
    'TimedPolicies',
    (
      await getPlaceholder(bootstrap, 4)
    ).address
  )

  const policy = await deployFrom(wallet, 'PolicyTest')

  const trustedNodesProxy = await ethers.getContractAt(
    'EcoInitializable',
    (
      await getPlaceholder(bootstrap, 5)
    ).address
  )
  const trustedNodesImpl = await deployFrom(
    wallet,
    'TrustedNodes',
    policyProxy.address,
    trustedNodesList,
    voteReward
  )
  await bindProxy(bootstrap, trustedNodesImpl, 5)

  const trustedNodes = await ethers.getContractAt(
    'TrustedNodes',
    trustedNodesProxy.address
  )

  const faucet = await deployFrom(wallet, 'EcoFaucet', policyProxy.address)

  return {
    vdfVerifier,
    lockup,
    inflation,
    governance,
    policyVotes,
    policyProposals,
    ecoXStaking,
    currencyTimer,
    timedPolicies,
    policy,
    trustedNodes,
    faucet,
  }
}

exports.ecoFixture = async (trustedNodes, voteReward) => {
  const [wallet] = await ethers.getSigners()
  return exports.bootstrap(wallet, trustedNodes, voteReward)
}

exports.singletonsFixture = async (signer) => {
  await exports.deploySingletons(signer)
  return ethers.getContractAt(
    'IERC1820Registry',
    '0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24'
  )
}

exports.ZERO_ADDR = '0x0000000000000000000000000000000000000000'
