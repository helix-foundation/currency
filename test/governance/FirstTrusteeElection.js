const { expect } = require('chai')
const time = require('../utils/time.ts')
const { ecoFixture, policyFor } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('E2E Election of First Cohort and Funding of TrustedNodes [@group=9]', async () => {
  let policy
  let eco
  let ecox
  let timedPolicies
  let policyProposals
  let policyVotes
  let initInflation
  let trustedNodes
  let trusteeReplacement

  let alice
  let bob
  let charlie
  let dave

  const stake = ethers.utils.parseEther('200000000')
  const firstYearRewards = ethers.utils.parseEther('4750000')

  it('Deploys the production system', async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie, dave] = accounts
    ;({
      policy,
      eco,
      ecox,
      faucet: initInflation,
      timedPolicies,
      trustedNodes,
    } = await ecoFixture())
  })

  it('Stakes accounts', async () => {
    /* Until we have some idea how initial distribution is done, this *does* use
     *a test-function
     */
    await initInflation.mint(await alice.getAddress(), stake)
    await initInflation.mint(await bob.getAddress(), stake)
    await initInflation.mint(await charlie.getAddress(), stake)
    await initInflation.mint(await dave.getAddress(), stake)

    await initInflation.mintx(policy.address, firstYearRewards)
  })

  it('Waits a generation', async () => {
    await time.increase(3600 * 24 * 14)
    await timedPolicies.incrementGeneration()
  })

  it('Constructs the proposal', async () => {
    trusteeReplacement = await deploy('FirstTrusteeElection', [
      await alice.getAddress(),
      await bob.getAddress(),
      await charlie.getAddress(),
      await dave.getAddress(),
    ])
    const name = await trusteeReplacement.name()
    expect(name).to.equal('First Trustee Election Proposal Template')
    expect(await trusteeReplacement.description()).to.equal(
      'Appoints this list of trustees as the first cohort and allocates their rewards'
    )
    expect(await trusteeReplacement.url()).to.equal(
      'https://description.of.proposal make this link to a discussion of the new trustee slate'
    )
    expect(await trusteeReplacement.newTrustees(0)).to.equal(
      await alice.getAddress()
    )
    expect(await trusteeReplacement.newTrustees(1)).to.equal(
      await bob.getAddress()
    )
    expect(await trusteeReplacement.newTrustees(2)).to.equal(
      await charlie.getAddress()
    )
    expect(await trusteeReplacement.newTrustees(3)).to.equal(
      await dave.getAddress()
    )
  })

  it('Checks that length of trustee cohort is 0, indicating no trustees', async () => {
    const _numTrustees = (await trustedNodes.numTrustees()).toNumber()
    expect(_numTrustees).to.equal(0)
  })

  it('Checks that initial ecox balance of trustedNodes is 0', async () => {
    const trustedNodesBalance = (
      await ecox.balanceOf(trustedNodes.address)
    ).toNumber()
    expect(trustedNodesBalance).to.equal(0)
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
      .registerProposal(trusteeReplacement.address)

    await time.increase(3600 * 24 * 2)
  })

  it('Adds stake to the proposal to ensure it goes to a vote', async () => {
    await policyProposals.connect(alice).support(trusteeReplacement.address)
    await policyProposals.connect(bob).support(trusteeReplacement.address)
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
    await time.increase(3600 * 24 * 7)
  })

  it('Executes the outcome of the votes', async () => {
    await policyVotes.execute()
  })

  it('Checks that there are four trustees', async () => {
    const _numTrustees = (await trustedNodes.numTrustees()).toNumber()
    expect(_numTrustees).to.equal(4)
  })

  it('Checks that new ecox balance of trustedNodes is 250k', async () => {
    const trustedNodesBalance = await ecox.balanceOf(trustedNodes.address)
    expect(trustedNodesBalance).to.equal(firstYearRewards)
  })
})
