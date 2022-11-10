/*
 * This is an end-to-end demo of the proposal: VoteCheckpointsUpgrade.propo.sol
 * The ECO contract is getting an upgraded implementation for the proxy
 * The ECOxStaking contract identifier is getting moved to a new contract (which is proxied)
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

describe('E2E Proxied Contract Upgrade [@group=9]', () => {
  let policy
  let eco
  let ecox
  let timedPolicies
  let policyProposals
  let policyVotes
  let initInflation

  let ecoXStaking
  let makePoodlexStaking
  let poodleCheck
  let retryPoodleCheck

  let alice
  let bob
  let charlie
  let dave
  let trustedNodes

  const staked = ethers.utils.parseEther('50')

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
      ecox,
      ecoXStaking,
      faucet: initInflation,
      timedPolicies,
    } = await ecoFixture(trustedNodes))
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

  it('Checks that the current staking contract is not poodles', async () => {
    poodleCheck = await ethers.getContractAt(
      'PoodlexStaking',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['ECOxStaking'])
      )
    )

    // the contract at ID_ECOXSTAKING is not poodles so it does not have this function
    expect(poodleCheck.address).to.equal(ecoXStaking.address)
    await expect(poodleCheck.provePoodles()).to.be.reverted
  })

  it('stakes ECOx on current staking contract', async () => {
    await ecox.connect(alice).approve(ecoXStaking.address, staked)
    await ecoXStaking.connect(alice).deposit(staked)
  })

  it('Constructs the proposal', async () => {
    poodlexStaking = await deploy('PoodlexStaking', policy.address, ecox.address)
    makePoodlexStaking = await deploy(
      'VoteCheckpointsUpgrade',
      poodlexStaking.address,
    )
    const name = await makePoodlexStaking.name()
    expect(name).to.equal('VoteCheckpointsUpgrade')
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
      .registerProposal(makePoodlexStaking.address)
  })

  it('Adds stake to the proposal to ensure it goes to a vote', async () => {
    await policyProposals.connect(bob).support(makePoodlexStaking.address)
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

  // it('Moves to the next generation', async () => {
  //   await time.increase(3600 * 24 * 10)
  //   await timedPolicies.incrementGeneration()
  // })

  it('Checks that the address has changed', async () => {
    const stakingHash = ethers.utils.solidityKeccak256(['string'], ['ECOxStaking'])
    retryPoodleCheck = await ethers.getContractAt(
      'PoodlexStaking', await policyFor(policy, stakingHash))
    expect(retryPoodleCheck).to.not.equal(ecoXStaking.address)
  })

  it('Checks that the new staking contract is poodles', async () => {
    const poodles = await retryPoodleCheck.provePoodles()
    expect(poodles).to.be.true
  })
})
