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

describe('E2E Proposal Lockup Contract Template Upgrade [@group=2]', () => {
  let policy
  let eco
  let currencyTimer
  let timedPolicies
  let policyProposals
  let policyVotes
  let initInflation

  let lockupUpgrade
  let switcherCurrencyTimer
  let switcherTimedPolicies
  let notifier
  let poodleLockup

  let alice
  let bob
  let charlie
  let dave

  it('Deploys the production system', async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie, dave] = accounts
    ;({
      policy,
      eco,
      faucet: initInflation,
      timedPolicies,
      currencyTimer,
    } = await ecoFixture([
      await bob.getAddress(),
      await charlie.getAddress(),
      await dave.getAddress(),
    ]))
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

  it('Checks that the current governance contract is not poodles', async () => {
    const notPoodleLockupImpl = await ethers.getContractAt(
      'PoodleLockup',
      await currencyTimer.lockupImpl()
    )
    expect(await notPoodleLockupImpl.currencyTimer()).to.equal(
      currencyTimer.address
    )
    // the contract at ID_CURRENCY_GOVERNANCE is not poodles so it does not have this function
    await expect(notPoodleLockupImpl.provePoodles()).to.be.reverted
  })

  it('Constructs the proposal', async () => {
    poodleLockup = await deploy(
      'PoodleLockup',
      policy.address,
      eco.address,
      currencyTimer.address
    )
    switcherCurrencyTimer = await deploy('SwitcherCurrencyTimer')
    switcherTimedPolicies = await deploy('SwitcherTimedPolicies')

    notifier = await deploy('Notifier', policy.address)
    lockupUpgrade = await deploy(
      'LockupUpgradeAndNotifier',
      poodleLockup.address,
      notifier.address,
      switcherCurrencyTimer.address,
      switcherTimedPolicies.address
    )
    const name = await lockupUpgrade.name()
    expect(name).to.equal('Lockup Upgrade and Notifier')
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
    await policyProposals.connect(alice).registerProposal(lockupUpgrade.address)
  })

  it('Adds stake to the proposal to ensure it goes to a vote', async () => {
    await policyProposals.connect(bob).support(lockupUpgrade.address)
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

  it('Checks that the new lockup contract is poodles', async () => {
    const poodleLockupImpl = await ethers.getContractAt(
      'PoodleLockup',
      await currencyTimer.lockupImpl()
    )
    const poodles = await poodleLockupImpl.provePoodles()
    expect(poodles).to.be.true
  })

  it('Check that the notifier is added to TimedPolicies', async () => {
    const notifierHash = await timedPolicies.notificationHashes(2)
    expect(notifierHash).to.equal(await lockupUpgrade.NOTIFIER_ID())
  })
})
