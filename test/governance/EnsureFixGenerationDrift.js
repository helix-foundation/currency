/*
 * This is a test of the proposal: FixGenerationDrift.propo.sol
 *
 * Note that this 'test' shares states between the it() functions, and
 * it() is used mostly to break up the logical steps.
 *
 * The purpose of this demo is to help confirm the correct function of the proposal
 */

const { expect } = require('chai')
const time = require('../utils/time.ts')
const { ecoFixture, policyFor } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('E2E Proxied Contract Upgrade [@group=2]', () => {
  let policy
  let eco
  let timedPolicies
  let currencyGovernance
  let policyProposals
  let policyVotes
  let initInflation

  let generationEnd
  let currencyGovernanceProposalEnds
  let policyProposalsProposalEnds

  let newTimedPolicies
  let newPolicyProposals
  let newCurrencyGovernance

  let switcherTimedPolicies
  let switcherCurrencyTimer
  let implementationUpdatingTarget

  let fixGenerationDrift

  let alice
  let bob
  let charlie
  let dave
  let trustedNodes

  // amount of ECO to mint for each account
  const stake = ethers.utils.parseEther('5000000')

  before('Deploys the production system', async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie, dave] = accounts
    trustedNodes = [
      await bob.getAddress(),
      await charlie.getAddress(),
      await dave.getAddress(),
    ]
    ;({
      policy,
      eco,
      faucet: initInflation,
      timedPolicies,
    } = await ecoFixture(trustedNodes))
  })

  it('Stakes accounts', async () => {
    await initInflation.mint(await alice.getAddress(), stake)
    await initInflation.mint(await bob.getAddress(), stake)
    await initInflation.mint(await charlie.getAddress(), stake)
    await initInflation.mint(await dave.getAddress(), stake)
  })

  it('Waits a generation', async () => {
    await time.increase(3600 * 24 * 14)
    await timedPolicies.incrementGeneration()
  })

  it('Checks that the current contracts are not poodles', async () => {
    const tp = await ethers.getContractAt(
      'PoodleTimedPolicies',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['TimedPolicies'])
      )
    )

    const cg = await ethers.getContractAt(
      'PoodleCurrencyGovernance',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
      )
    )

    const pp = await ethers.getContractAt(
      'PoodlePolicyProposals',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['PolicyProposals'])
      )
    )

    // fetch the window closure times to check proposal changes against
    generationEnd = await tp.generationEnd()
    currencyGovernanceProposalEnds = await cg.proposalEnds()
    policyProposalsProposalEnds = await pp.proposalEnds()

    // these shouldnt be poodles rn, so poke should revert
    await expect(tp.poke()).to.be.reverted
    await expect(cg.poke()).to.be.reverted
    await expect(pp.poke()).to.be.reverted
  })

  it('Constructs the proposal', async () => {
    newPolicyProposals = await deploy(
      'PoodlePolicyProposals',
      policy.address,
      await (
        await ethers.getContractAt(
          'PolicyProposals',
          await policyFor(
            policy,
            ethers.utils.solidityKeccak256(['string'], ['PolicyProposals'])
          )
        )
      ).policyVotesImpl(),
      eco.address
    )

    const randomBytes32 = [
      '0x9f24c52e0fcd1ac696d00405c3bd5adc558c48936919ac5ab3718fcb7d70f93f',
    ]
    newTimedPolicies = await deploy(
      'PoodleTimedPoliciesVerbose',
      policy.address,
      newPolicyProposals.address,
      randomBytes32
    )

    newCurrencyGovernance = await deploy(
      'PoodleCurrencyGovernance',
      policy.address,
      await (
        await ethers.getContractAt(
          'CurrencyGovernance',
          await policyFor(
            policy,
            ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
          )
        )
      ).pauser()
    )

    implementationUpdatingTarget = await deploy('ImplementationUpdatingTarget')
    switcherCurrencyTimer = await deploy('SwitcherCurrencyTimer')
    switcherTimedPolicies = await deploy('SwitcherTimedPolicies')

    fixGenerationDrift = await deploy(
      'FixGenerationDrift',
      implementationUpdatingTarget.address,
      switcherCurrencyTimer.address,
      switcherTimedPolicies.address,
      newTimedPolicies.address,
      newCurrencyGovernance.address,
      newPolicyProposals.address
    )

    expect(await fixGenerationDrift.name()).to.eq('Prevent Generation Drift')
    expect(await fixGenerationDrift.description()).to.eq(
      'Pegging the start and end times of generations to those of the previous generation. This change also affects the start and end times of the first phase of both monetary and community governance.'
    )
    expect(await fixGenerationDrift.url()).to.eq(
      'https://forums.eco.org/t/egp-009-eliminate-generation-drift/258'
    )
    expect(await fixGenerationDrift.implementationUpdatingTarget()).to.eq(
      implementationUpdatingTarget.address
    )
    expect(await fixGenerationDrift.switcherCurrencyTimer()).to.eq(
      switcherCurrencyTimer.address
    )
    expect(await fixGenerationDrift.switcherTimedPolicies()).to.eq(
      switcherTimedPolicies.address
    )
    expect(await fixGenerationDrift.newTimedPolicies()).to.eq(
      newTimedPolicies.address
    )
    expect(await fixGenerationDrift.newCurrencyGovernance()).to.eq(
      newCurrencyGovernance.address
    )
    expect(await fixGenerationDrift.newPolicyProposals()).to.eq(
      newPolicyProposals.address
    )
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
    await policyProposals
      .connect(alice)
      .registerProposal(fixGenerationDrift.address)
  })

  it('Adds stake to the proposal to ensure it goes to a vote', async () => {
    await policyProposals.connect(bob).support(fixGenerationDrift.address)
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
    const oldtp = await ethers.getContractAt(
      'TimedPolicies',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['TimedPolicies'])
      )
    )
    const generationEnd = await oldtp.generationEnd()

    await policyVotes.execute()

    timedPolicies = await ethers.getContractAt(
      'PoodleTimedPoliciesVerbose',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['TimedPolicies'])
      )
    )
    const poodles = await timedPolicies.poodles()
    
    expect(generationEnd.eq(poodles)).to.be.true
  })
})
