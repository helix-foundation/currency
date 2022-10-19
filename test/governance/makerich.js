/*
 * This is not a unit-test, it's an end-to-end demo of how policy votes
 * will work in production. This file should not include or use any
 * derived test-only contracts; the only helper is the manipulation of
 * time.
 *
 * Note that this 'test' shares states between the it() functions, and
 * it() is used mostly to break up the logical steps.
 *
 * The purpose of this demo is to propose 2 policy changes:
 * - Immediately Mint 1 000 000 Eco to accounts[3]
 * - Install a backdoor in the policy system
 *
 * Votes will be cast so both proposals end up on the ballot, but only
 * the first proposal will pass the final vote.
 */

const { expect } = require('chai')
const time = require('../utils/time.ts')
const { ecoFixture, policyFor } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('E2E Funding an Account with a Proposal [@group=4]', () => {
  let policy
  let eco
  let timedPolicies
  let makerich
  let backdoor
  let policyProposals
  let policyVotes
  let initInflation
  let accounts

  const stake = ethers.utils.parseEther('5000000')

  it('Deploys the production system', async () => {
    accounts = await ethers.getSigners()
    ;({
      policy,
      eco,
      faucet: initInflation,
      timedPolicies,
    } = await ecoFixture([]))
  })

  it('Stakes accounts', async () => {
    /* Until we have some idea how initial distribution is done, this *does* use
     *a test-function
     */
    await initInflation.mint(await accounts[1].getAddress(), stake)
    await initInflation.mint(await accounts[2].getAddress(), stake)
    await initInflation.mint(await accounts[3].getAddress(), stake)
    await initInflation.mint(await accounts[4].getAddress(), stake)
    await initInflation.mint(await accounts[5].getAddress(), stake.mul(4))
  })

  it('Waits a generation', async () => {
    await time.increase(3600 * 24 * 14)
    await timedPolicies.incrementGeneration()
  })

  it('Constructs the proposals', async () => {
    makerich = await deploy('MakeRich', await accounts[6].getAddress(), stake)
    backdoor = await deploy('MakeBackdoor', await accounts[2].getAddress())
  })

  it('Find the policy proposals instance', async () => {
    const proposalsHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['PolicyProposals']
    )
    //    await timedPolicies.incrementGeneration();
    policyProposals = await ethers.getContractAt(
      'PolicyProposals',
      await policyFor(policy, proposalsHash)
    )
  })

  it('Accepts new proposals', async () => {
    await eco
      .connect(accounts[1])
      .approve(policyProposals.address, await policyProposals.COST_REGISTER())
    await policyProposals
      .connect(accounts[1])
      .registerProposal(makerich.address)

    await eco
      .connect(accounts[2])
      .approve(policyProposals.address, await policyProposals.COST_REGISTER())
    await policyProposals
      .connect(accounts[2])
      .registerProposal(backdoor.address)
  })

  it('Adds stake to the proposal to ensure it goes to a vote', async () => {
    await policyProposals.connect(accounts[1]).support(makerich.address)

    await policyProposals.connect(accounts[2]).support(backdoor.address)
    await policyProposals.connect(accounts[2]).support(makerich.address)
    await policyProposals.connect(accounts[1]).deployProposalVoting()
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
    await policyVotes.connect(accounts[1]).vote(true)
    await policyVotes.connect(accounts[2]).vote(true)
  })

  it('Waits until the voting period ends', async () => {
    await time.increase(3600 * 24 * 4 + 1)
  })

  it('Executes the outcome of the votes', async () => {
    await policyVotes.execute()
  })

  it('Refunds the missed proposal', async () => {
    // 10 total days of waiting until the refunds can be accessed
    await time.increase(3600 * 24 * 6 + 1)
    await policyProposals.refund(backdoor.address)
  })

  it('Confirms the backdoor is not there', async () => {
    const backdoorHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['Backdoor']
    )
    expect(await policyFor(policy, backdoorHash)).to.equal(
      ethers.constants.AddressZero
    )
  })

  it('Celebrates accounts[6]', async () => {
    expect(await eco.balanceOf(await accounts[6].getAddress())).to.equal(stake)
  })
})
