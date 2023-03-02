/*
 * This is an end-to-end demo of policy votes to add functionality to
 * the lockup contract.
 *
 * Note that this 'test' shares states between the it() functions, and
 * it() is used mostly to break up the logical steps.
 *
 * The purpose of this demo is to propose a policy change that alters
 * lockup functionality to add a test function
 */

const { expect } = require('chai')
const time = require('../utils/time.ts')
const { ecoFixture, policyFor } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('E2E Proposal IRHP Contract Template Upgrade [@group=2]', () => {
  let policy
  let eco
  let ecox
  let currencyTimer
  let timedPolicies
  let policyProposals
  let policyVotes
  let inflation
  let rootHashProposal
  let notifier
  let amm
  let initInflation

  let irhpUpgrade
  let switcherRandomInflation
  let poodleIRHP

  let alice
  let bob
  let charlie
  let dave

  const minimalAMMABI = ['function sync()']
  const ammInterface = new ethers.utils.Interface(minimalAMMABI)
  const syncData = ammInterface.encodeFunctionData('sync')

  it('Deploys the production system', async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie, dave] = accounts
    ;({
      policy,
      eco,
      ecox,
      faucet: initInflation,
      timedPolicies,
      currencyTimer,
      inflation,
      rootHashProposal,
      notifier,
    } = await ecoFixture([
      await bob.getAddress(),
      await charlie.getAddress(),
      await dave.getAddress(),
    ]))

    amm = await deploy('DummyAMMPool', eco.address, ecox.address)
  })

  it('Stakes accounts', async () => {
    const stake = ethers.utils.parseEther('5000000')
    await initInflation.mint(await alice.getAddress(), stake)
    await initInflation.mint(await bob.getAddress(), stake)
    await initInflation.mint(await charlie.getAddress(), stake)
    await initInflation.mint(await dave.getAddress(), stake)
  })

  it('Waits a generation', async () => {
    await time.increase(3600 * 24 * 14)
    await timedPolicies.incrementGeneration()
  })

  it('Checks that the current irhp contract is not poodles', async () => {
    expect(await currencyTimer.inflationImpl()).to.equal(inflation.address)
    expect(await inflation.inflationRootHashProposal()).to.equal(
      rootHashProposal.address
    )
    // the IRHP is not poodles so it does not have this function
    const notPoodleIRHPImpl = await ethers.getContractAt(
      'PoodleLockup',
      rootHashProposal.address
    )
    await expect(notPoodleIRHPImpl.provePoodles()).to.be.reverted
  })

  it('Checks that there is no notifier txs yet', async () => {
    expect(await notifier.transactionsSize()).to.equal(0)
  })

  it('Constructs the proposal', async () => {
    poodleIRHP = await deploy('PoodleIRHP', policy.address, eco.address)
    switcherRandomInflation = await deploy('SwitcherRandomInflation')

    irhpUpgrade = await deploy(
      'IRHPUpgradeAndNotifierData',
      poodleIRHP.address,
      switcherRandomInflation.address,
      amm.address,
      syncData
    )
    const name = await irhpUpgrade.name()
    expect(name).to.equal('InflationRootHashProposal Upgrade and AMM Syncing')
    const data = await irhpUpgrade.notifierData()
    expect(data).to.equal(syncData)
  })

  it('Find the policy proposals instance', async () => {
    const proposalsHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['PolicyProposals']
    )
    policyProposals = await ethers.getContractAt(
      'PolicyProposals',
      await policyFor(policy, proposalsHash)
    )
  })

  it('Accepts new proposals', async () => {
    await eco
      .connect(alice)
      .approve(policyProposals.address, await policyProposals.COST_REGISTER())
    await policyProposals.connect(alice).registerProposal(irhpUpgrade.address)
  })

  it('Adds stake to the proposal to ensure it goes to a vote', async () => {
    await policyProposals.connect(bob).support(irhpUpgrade.address)
    await policyProposals.connect(bob).deployProposalVoting()
  })

  it('Find the policy votes instance', async () => {
    const policyVotesIdentifierHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['PolicyVotes']
    )
    policyVotes = await ethers.getContractAt(
      'PolicyVotes',
      await policyFor(policy, policyVotesIdentifierHash)
    )
  })

  it('Allows all users to vote', async () => {
    await policyVotes.connect(alice).vote(true)
    await policyVotes.connect(bob).vote(true)
  })

  it('Waits until the end of the voting period', async () => {
    await time.increase(3600 * 24 * 4)
  })

  it('Executes the outcome of the votes', async () => {
    await policyVotes.execute()
  })

  it('Moves to the next generation', async () => {
    await time.increase(3600 * 24 * 10)
    await timedPolicies.incrementGeneration()
  })

  it('Checks that the new irhp contract is poodles', async () => {
    const poodleIRHPImpl = await ethers.getContractAt(
      'PoodleIRHP',
      await inflation.inflationRootHashProposal()
    )
    const poodles = await poodleIRHPImpl.provePoodles()
    expect(poodles).to.be.true
  })

  it('Check that the notifier has the added transaction data', async () => {
    expect(await notifier.transactionsSize()).to.equal(1)
    const tx = await notifier.transactions(0)
    expect(tx.destination).to.equal(amm.address)
    expect(tx.data).to.equal(syncData)
  })
})
