/*
 * This is an end-to-end test of trustee voting to change the trustee list
 *
 * Note that this 'test' shares states between the it() functions, and
 * it() is used mostly to break up the logical steps.
 *
 * The purpose of this test is to show how a single trustee can be replaced,
 * how a full suite of trustees can be replaces, and how a new TrustedNodes
 * contract can replace the old one.
 */

const { expect } = require('chai')
const time = require('../utils/time.ts')
const { ecoFixture, policyFor } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('E2E Proposal Single Trustee Change [@group=2]', () => {
  let policy
  let eco
  let timedPolicies
  let policyProposals
  let policyVotes
  let initInflation
  let trustedNodes
  let singleTrusteeReplacement

  let alice
  let bob
  let charlie
  let dave

  it('Deploys the production system', async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie, dave] = accounts
    const trustees = [
      await bob.getAddress(),
      await charlie.getAddress(),
      await dave.getAddress(),
    ]

    ;({
      policy,
      eco,
      faucet: initInflation,
      timedPolicies,
      trustedNodes,
    } = await ecoFixture(trustees))
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

  it('Constructs the proposal', async () => {
    singleTrusteeReplacement = await deploy(
      'SingleTrusteeReplacement',
      await bob.getAddress(),
      await alice.getAddress()
    )
    expect(await singleTrusteeReplacement.name()).to.equal(
      'Trustee Replacement Proposal Template'
    )
    expect(await singleTrusteeReplacement.description()).to.equal(
      'Replaces a single trustee with another'
    )
    expect(await singleTrusteeReplacement.url()).to.equal(
      'https://description.of.proposal make this link to a discussion of the no confidence vote'
    )
    expect(await singleTrusteeReplacement.oldTrustee()).to.equal(
      await bob.getAddress()
    )
    expect(await singleTrusteeReplacement.newTrustee()).to.equal(
      await alice.getAddress()
    )
  })

  it('Checks that bob initially a trustee', async () => {
    const bobBool = await trustedNodes.isTrusted(await bob.getAddress())
    // console.log(bobBool);
    expect(bobBool).to.be.true
  })

  it('Checks that charlie initially a trustee', async () => {
    const charlieBool = await trustedNodes.isTrusted(await charlie.getAddress())
    // console.log(charlieBool);
    expect(charlieBool).to.be.true
  })

  it('Checks that dave initially a trustee', async () => {
    const daveBool = await trustedNodes.isTrusted(await dave.getAddress())
    // console.log(daveBool);
    expect(daveBool).to.be.true
  })

  it('Checks that alice is not yet a trustee', async () => {
    const aliceBool = await trustedNodes.isTrusted(await alice.getAddress())
    // console.log(aliceBool);
    expect(aliceBool).to.be.false
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
      .registerProposal(singleTrusteeReplacement.address)
  })

  it('Adds stake to the proposal to ensure it goes to a vote', async () => {
    await policyProposals.connect(bob).support(singleTrusteeReplacement.address)
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

  it('Checks that bob is no longer a trustee', async () => {
    const bobBool = await trustedNodes.isTrusted(await bob.getAddress())
    // console.log(bobBool);
    expect(bobBool).to.be.false
  })

  it('Checks that charlie is still a trustee', async () => {
    const charlieBool = await trustedNodes.isTrusted(await charlie.getAddress())
    // console.log(charlieBool);
    expect(charlieBool).to.be.true
  })

  it('Checks that dave is still a trustee', async () => {
    const daveBool = await trustedNodes.isTrusted(await dave.getAddress())
    // console.log(daveBool);
    expect(daveBool).to.be.true
  })

  it('Checks that alice is now a trustee', async () => {
    const aliceBool = await trustedNodes.isTrusted(await alice.getAddress())
    // console.log(aliceBool);
    expect(aliceBool).to.be.true
  })
})
