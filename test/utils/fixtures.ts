/* eslint-disable no-param-reassign, no-console, camelcase */
// @ts-nocheck
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { BytesLike, Contract } from 'ethers'
import { PromiseOrValue } from 'graphql/jsutils/PromiseOrValue'
import hre from 'hardhat'
import {
  CurrencyGovernance__factory,
  CurrencyTimer__factory,
  ECO__factory,
  EcoBootstrap__factory,
  EcoFaucet__factory,
  EcoInitializable__factory,
  ECOx__factory,
  ECOxStaking__factory,
  IERC1820Registry__factory,
  InflationRootHashProposal__factory,
  Lockup__factory,
  Notifier__factory,
  PolicyProposals__factory,
  PolicyTest__factory,
  PolicyVotes__factory,
  RandomInflation__factory,
  TimedPolicies__factory,
  TokenInit__factory,
  TrustedNodes__factory,
  VDFVerifier__factory,
  CurrencyGovernance,
  CurrencyTimer,
  ECO,
  EcoBootstrap,
  EcoFaucet,
  EcoInitializable,
  ECOx,
  ECOxStaking,
  IERC1820Registry,
  InflationRootHashProposal,
  Lockup,
  Notifier,
  Policy,
  PolicyProposals,
  PolicyTest,
  PolicyVotes,
  RandomInflation,
  TimedPolicies,
  TokenInit,
  TrustedNodes,
  VDFVerifier,
  PolicyInit__factory,
  PolicyInit,
} from '../../typechain-types'
import { deploy } from './fixture-deploy-util'
const {
  ERC1820_REGISTRY,
  REGISTRY_DEPLOY_TX,
} = require('../../tools/constants')

export type FixturesContracts = {
  ecoXStaking: ECOxStaking
  currencyTimer: CurrencyTimer
  timedPolicies: TimedPolicies
  trustedNodes: TrustedNodes
  faucet: EcoFaucet
  eco: ECO
  ecox: ECOx
  notifier: Notifier
}

export type CoreDeploy = {
  ecoImpl: ECO
  tokenInit: TokenInit
  ecoxImpl: ECOx
}

export type PeripheralContracts = {
  vdfVerifier: VDFVerifier
  lockup: Lockup
  inflation: RandomInflation
  governance: CurrencyGovernance
  rootHashProposal: InflationRootHashProposal
  policyVotes: PolicyVotes
  policyProposals: PolicyProposals
  ecoXStaking: ECOxStaking
  notifier: Notifier
  currencyTimer: CurrencyTimer
  timedPolicies: TimedPolicies
  policy: PolicyTest
  trustedNodes: TrustedNodes
  faucet: EcoFaucet
}

const initialECOxSupply = hre.ethers.utils.parseEther('100')

const ECOx_STAKING_HASH = hre.ethers.utils.solidityKeccak256(
  ['string'],
  ['ECOxStaking']
)
const CURRENCY_TIMER_HASH = hre.ethers.utils.solidityKeccak256(
  ['string'],
  ['CurrencyTimer']
)
const TIMED_POLICIES_HASH = hre.ethers.utils.solidityKeccak256(
  ['string'],
  ['TimedPolicies']
)
const POLICY_PROPOSALS_HASH = hre.ethers.utils.solidityKeccak256(
  ['string'],
  ['PolicyProposals']
)
const POLICY_VOTES_HASH = hre.ethers.utils.solidityKeccak256(
  ['string'],
  ['PolicyVotes']
)
const TRUSTED_NODES_HASH = hre.ethers.utils.solidityKeccak256(
  ['string'],
  ['TrustedNodes']
)
const NOTIFIER_HASH = hre.ethers.utils.solidityKeccak256(['string'], ['Notifier'])
const ECO_HASH = hre.ethers.utils.solidityKeccak256(['string'], ['ECO'])
const ECOx_HASH = hre.ethers.utils.solidityKeccak256(['string'], ['ECOx'])
const FAUCET_HASH = hre.ethers.utils.solidityKeccak256(['string'], ['Faucet'])

/**
 * Gets the initializable proxy slot at index
 */
async function getPlaceholder(
  bootstrap: EcoBootstrap,
  index: number
): Promise<EcoInitializable> {
  const placeholderAddress = await bootstrap.placeholders(index)
  return (new EcoInitializable__factory()).attach(placeholderAddress)
}

/**
 * Binds a contract to the given proxy index
 */
async function bindProxy(
  wallet: SignerWithAddress,
  bootstrap: EcoBootstrap,
  contract: Contract,
  index: number
) {
  const proxy = await getPlaceholder(bootstrap, index)
  const tx = await proxy.connect(wallet).fuseImplementation(contract.address)
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
    NOTIFIER_HASH,
  ]
}

/**
 * For ECO Init fusedInit
 */
function getAddresses(contracts: FixturesContracts) {
  return [
    contracts.ecoXStaking.address,
    contracts.currencyTimer.address,
    contracts.timedPolicies.address,
    contracts.trustedNodes.address,
    contracts.faucet.address,
    contracts.eco.address,
    contracts.ecox.address,
    contracts.notifier.address,
  ]
}

/**
 * Deploys required singletons to the chain if not already there
 */
export async function deploySingletons(from: SignerWithAddress): Promise<any> {
  if ((await hre.ethers.provider.getCode(ERC1820_REGISTRY)).length > '0x0'.length) {
    return
  }

  await from.sendTransaction({
    to: '0xa990077c3205cbDf861e17Fa532eeB069cE9fF96',
    value: hre.ethers.utils.parseEther('0.08'),
  })
  await hre.ethers.provider.sendTransaction(REGISTRY_DEPLOY_TX)
}

export async function policyFor(
  policy: Policy,
  hash: PromiseOrValue<BytesLike>
): Promise<string> {
  const [signer] = await hre.ethers.getSigners()
  const erc1820 = IERC1820Registry__factory.connect(
    '0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24',
    signer
  )
  return erc1820.getInterfaceImplementer(policy.address, hash)
}

export async function bootstrap(
  wallet: SignerWithAddress,
  trustedNodes: string[] = [],
  voteReward = '1000'
): Promise<any> {
  await deploySingletons(wallet)

  // ### Stage 1
  // Deploy bootstrap contract
  const bootstrap = (await deploy(
    wallet,
    EcoBootstrap__factory,
    [await wallet.getAddress(),
    7]
  )) as EcoBootstrap

  // ### Stage 2
  // Deploy PolicyProxy, ECO, and ECOx contracts
  //
  // ![Step 2 of Policy Setup](https://www.lucidchart.com/publicSegments/view/ddd05c82-5b4b-4742-9f37-666ffd318261/image.png)
  const policyInit = await deploy(wallet, PolicyInit__factory) as PolicyInit
  const policyProxy = await bindProxy(wallet, bootstrap, policyInit, 0)

  const coreContracts = await deployCoreContracts(
    wallet,
    bootstrap,
    policyProxy
  )

  const { ecoImpl, ecoxImpl, tokenInit } = coreContracts

  const eco = await bindProxy(wallet, bootstrap, ecoImpl, 1)
  const ecox = await bindProxy(wallet, bootstrap, ecoxImpl, 2)

  // ### Stage 3
  // Constructing the policy set is the most complicated step of the deployment
  // process. Many of the contracts deployed here are templates that are cloned
  // when they are needed to help keep scope.
  // ![Step 3 of Policy Setup](https://www.lucidchart.com/publicSegments/view/8730274f-cb64-4605-b60c-5413723befba/image.png)
  const peripheralContracts = await deployPeripheralContracts(
    wallet,
    bootstrap,
    trustedNodes,
    voteReward,
    policyProxy,
    Object.assign(coreContracts, { eco, ecox })
  )
  const { timedPolicies, policy } = peripheralContracts

  const policyProxyInit = (new PolicyInit__factory(wallet)).attach(
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
  // .distributeTokens(eco.address, [await wallet.getAddress()], [hre.ethers.utils.parseEther('10')]);
  await tokenInit.distributeTokens(ecox.address, [
    {
      holder: await wallet.getAddress(),
      balance: initialECOxSupply,
    },
  ])

  // ### Stage 4
  // Here it mints some initial tokens. The initialization
  // contract self-destructs on first use to prevent any possible future run.
  //
  // Finally, now that everything is in place, it increments the first generation
  // which sends the code live to be used.
  //  await tokenInit.initializeAndFuse(eco.address);
  await timedPolicies.incrementGeneration()

  return {
    ...coreContracts,
    ...peripheralContracts,
    eco: (new ECO__factory(wallet)).attach(eco.address),
    ecox: (new ECOx__factory(wallet)).attach(ecox.address),
    policy: (new PolicyTest__factory(wallet)).attach(policyProxy.address),
  }
}

/**
 * Deploys the core contracts
 *  - InflationRootHashProposal
 *  - ECO implementation
 *  - ECOx implementation
 */
export async function deployCoreContracts(
  wallet: SignerWithAddress,
  bootstrap: EcoBootstrap,
  policyProxy: Contract
): Promise<CoreDeploy> {
  const ecoProxy = await getPlaceholder(bootstrap, 1)

  const _tokenInit = await deploy(wallet, TokenInit__factory) as TokenInit

  const deployments = []
  deployments.push(
    deploy(
      wallet,
      ECO__factory,
      [policyProxy.address,
      _tokenInit.address,
      0,
      '0xDEADBEeFbAdf00dC0fFee1Ceb00dAFACEB00cEc0']
    )
  )
  deployments.push(deploy(wallet, TokenInit__factory) as TokenInit)
  const [ecoImpl, tokenInit] = await Promise.all(deployments)

  const ecoxImpl = await deploy(
    wallet,
    ECOx__factory,
    [policyProxy.address,
    tokenInit.address,
    initialECOxSupply,
    ecoProxy.address,
    hre.ethers.constants.AddressZero]
  )

  return {
    ecoImpl: ecoImpl as ECO,
    tokenInit: tokenInit as TokenInit,
    ecoxImpl: ecoxImpl as ECOx,
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
export async function deployPeripheralContracts(
  wallet: SignerWithAddress,
  bootstrap: EcoBootstrap,
  trustedNodesList: string[],
  voteReward: string,
  policyProxy: Contract,
  coreContracts: FixturesContracts
): Promise<PeripheralContracts> {
  const { eco, ecox } = coreContracts

  const vdfVerifier = await deploy(
    wallet,
    VDFVerifier__factory,
    [policyProxy.address]
  )

  const rootHashProposal = await deploy(
    wallet,
    InflationRootHashProposal__factory,
    [policyProxy.address,
    eco.address]
  )

  const inflation = await deploy(
    wallet,
    RandomInflation__factory,
    [policyProxy.address,
    vdfVerifier.address,
    3,
    rootHashProposal.address,
    eco.address]
  )

  const currencyTimerProxy = await getPlaceholder(bootstrap, 3)

  const lockup = await deploy(
    wallet,
    Lockup__factory,
    [policyProxy.address,
    eco.address,
    currencyTimerProxy.address]
  )

  const governance = await deploy(
    wallet,
    CurrencyGovernance__factory,
    [policyProxy.address,
    hre.ethers.constants.AddressZero]
  )

  const policyVotes = await deploy(
    wallet,
    PolicyVotes__factory,
    [policyProxy.address,
    eco.address]
  )

  const policyProposals = await deploy(
    wallet,
    PolicyProposals__factory,
    [policyProxy.address,
    policyVotes.address,
    eco.address]
  )

  const ecoXStakingImpl = await deploy(
    wallet,
    ECOxStaking__factory,
    [policyProxy.address,
    ecox.address]
  )

  const notifier = await deploy(wallet, Notifier__factory, [policyProxy.address])

  await bindProxy(wallet, bootstrap, ecoXStakingImpl, 6)
  const ecoXStaking = (new ECOxStaking__factory(wallet)).attach((
      await getPlaceholder(bootstrap, 6)
    ).address
  )

  const currencyTimerImpl = await deploy(
    wallet,
    CurrencyTimer__factory,
    [policyProxy.address,
    governance.address,
    inflation.address,
    lockup.address,
    eco.address]
  )
  await bindProxy(wallet, bootstrap, currencyTimerImpl, 3)
  const currencyTimer = (new CurrencyTimer__factory(wallet)).attach
    ((
      await getPlaceholder(bootstrap, 3)
    ).address
  )

  const timedPoliciesImpl = await deploy(
    wallet,
    TimedPolicies__factory,
    [policyProxy.address,
    policyProposals.address,
    [ECO_HASH, CURRENCY_TIMER_HASH, NOTIFIER_HASH]]
  )
  await bindProxy(wallet, bootstrap, timedPoliciesImpl, 4)
  const timedPolicies = (new TimedPolicies__factory(wallet)).attach(
    (
      await getPlaceholder(bootstrap, 4)
    ).address
  )

  const policy = await deploy(wallet, PolicyTest__factory)

  const trustedNodesImpl = await deploy(
    wallet,
    TrustedNodes__factory,
    [policyProxy.address,
    trustedNodesList,
    voteReward]
  )
  await bindProxy(wallet, bootstrap, trustedNodesImpl, 5)

  const trustedNodes = (new TrustedNodes__factory(wallet)).attach(
    (await getPlaceholder(bootstrap, 5)).address
  )

  const faucet = await deploy(wallet, EcoFaucet__factory, [policyProxy.address])

  return {
    vdfVerifier: vdfVerifier as VDFVerifier,
    lockup: lockup as Lockup,
    inflation: inflation as RandomInflation,
    rootHashProposal: rootHashProposal as InflationRootHashProposal,
    governance: governance as CurrencyGovernance,
    policyVotes: policyVotes as PolicyVotes,
    policyProposals: policyProposals as PolicyProposals,
    ecoXStaking: ecoXStaking as ECOxStaking,
    notifier: notifier as Notifier,
    currencyTimer: currencyTimer as CurrencyTimer,
    timedPolicies: timedPolicies as TimedPolicies,
    policy: policy as PolicyTest,
    trustedNodes: trustedNodes as TrustedNodes,
    faucet: faucet as EcoFaucet,
  }
}

export async function ecoFixture(
  trustedNodes: string[],
  voteReward: string
): Promise<any> {
  const [wallet] = await hre.ethers.getSigners()
  return bootstrap(wallet, trustedNodes, voteReward)
}

export async function singletonsFixture(
  signer: SignerWithAddress
): Promise<IERC1820Registry> {
  await deploySingletons(signer)
  return IERC1820Registry__factory.connect(
    '0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24',
    signer
  )
}
