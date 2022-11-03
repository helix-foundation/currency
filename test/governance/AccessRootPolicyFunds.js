const { expect } = require('chai')
const time = require('../utils/time.ts')
const { ecoFixture, policyFor } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

const stake = ethers.utils.parseEther('20000')

describe('E2E Test to access funds in treasury [@group=9]', () => {
  describe('sends eco and ecox from the root policy to the charlie address', async () => {
    let policy
    let eco
    let ecox
    let timedPolicies
    let policyProposals
    let policyVotes
    let initInflation
    let accessRootPolicyFunds

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
        ecox,
        faucet: initInflation,
        timedPolicies,
      } = await ecoFixture())
    })

    it('Stakes accounts', async () => {
      await initInflation.mint(await alice.getAddress(), stake)
      await initInflation.mint(await bob.getAddress(), stake)
      await initInflation.mint(await dave.getAddress(), 500)

      await initInflation.mintx(await dave.getAddress(), 200)
    })

    it('transfers some funds to the treasury', async () => {
      await eco.connect(dave).transfer(policy.address, 500)
      await ecox.connect(dave).transfer(policy.address, 200)

      expect(await eco.balanceOf(policy.address)).to.equal(500)
      expect(await ecox.balanceOf(policy.address)).to.equal(200)
    })

    it('Waits a generation', async () => {
      await time.increase(3600 * 24 * 14)
      await timedPolicies.incrementGeneration()
    })

    it('Constructs the proposal', async () => {
      accessRootPolicyFunds = await deploy(
        'AccessRootPolicyFunds',
        await charlie.getAddress(),
        500,
        200
      )
      const name = await accessRootPolicyFunds.name()
      expect(name).to.equal('Root Policy Funds Use Template')
      expect(await accessRootPolicyFunds.description()).to.equal(
        'Sends ecoAmount and ecoXAmount of ECO and ECOx respectively to recipient'
      )
      expect(await accessRootPolicyFunds.url()).to.equal(
        'https://description.of.proposal make this link to a discussion what the funds are used for'
      )

      expect(await accessRootPolicyFunds.recipient()).to.equal(
        await charlie.getAddress()
      )
      expect(await accessRootPolicyFunds.ecoAmount()).to.equal(500)
      expect(await accessRootPolicyFunds.ecoXAmount()).to.equal(200)
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
        .registerProposal(accessRootPolicyFunds.address)

      await time.increase(3600 * 24 * 2)
    })

    it('Adds stake to the proposal to ensure it goes to a vote', async () => {
      await policyProposals
        .connect(alice)
        .support(accessRootPolicyFunds.address)
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
      expect(await eco.balanceOf(charlie.address)).to.equal(0)
      expect(await ecox.balanceOf(charlie.address)).to.equal(0)

      await policyVotes.execute()

      expect(await eco.balanceOf(charlie.address)).to.equal(500)
      expect(await ecox.balanceOf(charlie.address)).to.equal(200)
    })
  })
})
