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

const { ethers } = require('hardhat')
const time = require('../utils/time.ts')
const { ecoFixture } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')
const util = require('../../tools/test/util')

describe('Governance Trustee Change [@group=9]', () => {
  describe('add a trustee and replace one', async () => {
    let policy
    let eco
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

    it('Deploys the production system', async () => {
      const accounts = await ethers.getSigners()
      ;[alice, bob, charlie, dave] = accounts
      ;({
        policy,
        eco,
        faucet: initInflation,
        timedPolicies,
        trustedNodes,
      } = await ecoFixture([await alice.getAddress(), await bob.getAddress()]))
    })

    it('Stakes accounts', async () => {
      const stake = ethers.utils.parseEther('5000')
      /* Until we have some idea how initial distribution is done, this *does* use
       *a test-function
       */
      await initInflation.mint(await alice.getAddress(), stake)
      await initInflation.mint(await bob.getAddress(), stake)
      await initInflation.mint(await charlie.getAddress(), stake)
      await initInflation.mint(await dave.getAddress(), stake)
    })

    it('Waits a generation', async () => {
      await time.increase(3600 * 24 * 40)
      await timedPolicies.incrementGeneration()
    })

    it('Constructs the proposals', async () => {
      trusteeReplacement = await deploy('TrusteeReplacement', [
        await alice.getAddress(),
        await charlie.getAddress(),
        await dave.getAddress(),
      ])
      const name = await trusteeReplacement.name()
      expect(name).to.equal('Trustee Election Proposal Template')
      expect(await trusteeReplacement.description()).to.equal(
        'Created with a list of trustees and replaces all current trustees with those trustees'
      )
      expect(await trusteeReplacement.url()).to.equal(
        'https://description.of.proposal make this link to a discussion of the new trustee slate'
      )
      expect(await trusteeReplacement.newTrustees(0)).to.equal(
        await alice.getAddress()
      )
      expect(await trusteeReplacement.newTrustees(1)).to.equal(
        await charlie.getAddress()
      )
      expect(await trusteeReplacement.newTrustees(2)).to.equal(
        await dave.getAddress()
      )
    })

    it('Checks that alice is initially a trustee', async () => {
      const aliceBool = await trustedNodes.isTrusted(await alice.getAddress())
      // console.log(aliceBool);
      expect(aliceBool).to.be.true
    })

    it('Checks that bob is initially a trustee', async () => {
      const bobBool = await trustedNodes.isTrusted(await bob.getAddress())
      // console.log(bobBool);
      expect(bobBool).to.be.true
    })

    it('Checks that charlie is not yet a trustee', async () => {
      const charlieBool = await trustedNodes.isTrusted(
        await charlie.getAddress()
      )
      // console.log(charlieBool);
      expect(charlieBool).to.be.false
    })

    it('Checks that dave is not yet a trustee', async () => {
      const daveBool = await trustedNodes.isTrusted(await dave.getAddress())
      // console.log(daveBool);
      expect(daveBool).to.be.false
    })

    it('Kicks off a proposal round', async () => {
      const proposalsHash = ethers.utils.solidityKeccak256(
        ['string'],
        ['PolicyProposals']
      )
      policyProposals = await ethers.getContractAt(
        'PolicyProposals',
        await util.policyFor(policy, proposalsHash)
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

    it('Adds stake to proposals to ensure thati it goes to a vote', async () => {
      await policyProposals.connect(alice).support(trusteeReplacement.address)
      await policyProposals.connect(bob).support(trusteeReplacement.address)
      await policyProposals.connect(bob).deployProposalVoting()
    })

    it('Transitions from proposing to voting', async () => {
      const policyVotesIdentifierHash = ethers.utils.solidityKeccak256(
        ['string'],
        ['PolicyVotes']
      )
      policyVotes = await ethers.getContractAt(
        'PolicyVotes',
        await util.policyFor(policy, policyVotesIdentifierHash)
      )
    })

    it('Allows all users to vote', async () => {
      await policyVotes.connect(alice).vote(true)
      await policyVotes.connect(bob).vote(true)
    })

    it('Waits another week (end of commit period)', async () => {
      await time.increase(3600 * 24 * 7)
    })

    it('Executes the outcome of the votes', async () => {
      await expect(policyVotes.execute())
        .to.emit(trustedNodes, 'FundingRequest')
        .withArgs(26000)
    })

    it('Checks that alice is still a trustee', async () => {
      const aliceBool = await trustedNodes.isTrusted(await alice.getAddress())
      // console.log(aliceBool);
      expect(aliceBool).to.be.true
    })

    it('Checks that bob is no longer a trustee', async () => {
      const bobBool = await trustedNodes.isTrusted(await bob.getAddress())
      // console.log(bobBool);
      expect(bobBool).to.be.false
    })

    it('Checks that charlie is now a trustee', async () => {
      const charlieBool = await trustedNodes.isTrusted(
        await charlie.getAddress()
      )
      // console.log(charlieBool);
      expect(charlieBool).to.be.true
    })

    it('Checks that dave is now a trustee', async () => {
      const daveBool = await trustedNodes.isTrusted(await dave.getAddress())
      // console.log(daveBool);
      expect(daveBool).to.be.true
    })
  })
  describe('remove a trustee', async () => {
    let policy
    let eco
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

    it('Deploys the production system', async () => {
      const accounts = await ethers.getSigners()
      ;[alice, bob, charlie, dave] = accounts
      ;({
        policy,
        eco,
        faucet: initInflation,
        timedPolicies,
        trustedNodes,
      } = await ecoFixture([await alice.getAddress(), await bob.getAddress()]))
    })

    it('Stakes accounts', async () => {
      const stake = ethers.utils.parseEther('5000')
      /* Until we have some idea how initial distribution is done, this *does* use
       *a test-function
       */
      await initInflation.mint(await alice.getAddress(), stake)
      await initInflation.mint(await bob.getAddress(), stake)
      await initInflation.mint(await charlie.getAddress(), stake)
      await initInflation.mint(await dave.getAddress(), stake)
    })

    it('Waits a generation', async () => {
      await time.increase(3600 * 24 * 40)
      await timedPolicies.incrementGeneration()
    })

    it('Constructs the proposals', async () => {
      trusteeReplacement = await deploy('TrusteeReplacement', [
        await dave.getAddress(),
      ])
      const name = await trusteeReplacement.name()
      expect(name).to.equal('Trustee Election Proposal Template')
      expect(await trusteeReplacement.description()).to.equal(
        'Created with a list of trustees and replaces all current trustees with those trustees'
      )
      expect(await trusteeReplacement.url()).to.equal(
        'https://description.of.proposal make this link to a discussion of the new trustee slate'
      )
      expect(await trusteeReplacement.newTrustees(0)).to.equal(
        await dave.getAddress()
      )
    })

    it('Checks that alice is initially a trustee', async () => {
      const aliceBool = await trustedNodes.isTrusted(await alice.getAddress())
      // console.log(aliceBool);
      expect(aliceBool).to.be.true
    })

    it('Checks that bob is initially a trustee', async () => {
      const bobBool = await trustedNodes.isTrusted(await bob.getAddress())
      // console.log(bobBool);
      expect(bobBool).to.be.true
    })

    it('Checks that dave is not yet a trustee', async () => {
      const daveBool = await trustedNodes.isTrusted(await dave.getAddress())
      // console.log(daveBool);
      expect(daveBool).to.be.false
    })

    it('Kicks off a proposal round', async () => {
      const proposalsHash = ethers.utils.solidityKeccak256(
        ['string'],
        ['PolicyProposals']
      )
      policyProposals = await ethers.getContractAt(
        'PolicyProposals',
        await util.policyFor(policy, proposalsHash)
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

    it('Adds stake to proposals to ensure thati it goes to a vote', async () => {
      await policyProposals.connect(alice).support(trusteeReplacement.address)
      await policyProposals.connect(bob).support(trusteeReplacement.address)
      await policyProposals.connect(bob).deployProposalVoting()
    })

    it('Transitions from proposing to voting', async () => {
      const policyVotesIdentifierHash = ethers.utils.solidityKeccak256(
        ['string'],
        ['PolicyVotes']
      )
      policyVotes = await ethers.getContractAt(
        'PolicyVotes',
        await util.policyFor(policy, policyVotesIdentifierHash)
      )
    })

    it('Allows all users to vote', async () => {
      await policyVotes.connect(alice).vote(true)
      await policyVotes.connect(bob).vote(true)
    })

    it('Waits another week (end of commit period)', async () => {
      await time.increase(3600 * 24 * 7)
    })

    it('Executes the outcome of the votes', async () => {
      await policyVotes.execute()
    })

    it('Checks that alice is no longer a trustee', async () => {
      const aliceBool = await trustedNodes.isTrusted(await alice.getAddress())
      // console.log(aliceBool);
      expect(aliceBool).to.be.false
    })

    it('Checks that bob is no longer a trustee', async () => {
      const bobBool = await trustedNodes.isTrusted(await bob.getAddress())
      // console.log(bobBool);
      expect(bobBool).to.be.false
    })

    it('Checks that dave is now a trustee', async () => {
      const daveBool = await trustedNodes.isTrusted(await dave.getAddress())
      // console.log(daveBool);
      expect(daveBool).to.be.true
    })
  })
})
