const { expect } = require('chai')
const time = require('../utils/time.ts')
const { ecoFixture, policyFor } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('E2E Proposal addTxToNotifier upgrade [@group=2]', () => {
    let policy
    let eco
    let timedPolicies
    let policyProposals
    let policyVotes
    let notifier
    let l1Bridge
    let initInflation
  
    let addTxToNotifier
  
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
          notifier,
        } = await ecoFixture([
          await bob.getAddress(),
          await charlie.getAddress(),
          await dave.getAddress(),
        ]))
    
        l1Bridge = await deploy('DummyL1Bridge')
        console.log(l1Bridge)
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
    
      it('Checks that the current bridge contract is not rebased', async () => {
        expect(await l1Bridge.rebased()).to.be.false
      })
    
      it('Checks that there is no notifier txs yet', async () => {
        expect(await notifier.transactionsSize()).to.equal(0)
      })

      it('Constructs the proposal', async () => {
        addTxToNotifier = await deploy(
          'AddTxToNotifier',
          l1Bridge.address
        )
        const name = await addTxToNotifier.name()
        expect(name).to.equal('EGP #009 sync inflation multipliers on generation increment')
        const description = await addTxToNotifier.description()
        expect(description).to.equal("This proposal adds to the notifier a transaction that syncs the L2 inflation multiplier to the L1 one")
        const url = await addTxToNotifier.url()
        expect(url).to.equal('https://forums.eco.org/t/egp-009-sync-inflation-multipliers-on-generation-increment/264/1')
        const l1EcoBridge = await addTxToNotifier.l1EcoBridge()
        expect(l1EcoBridge).to.equal(l1Bridge.address)
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
        await policyProposals.connect(alice).registerProposal(addTxToNotifier.address)
      })
    
      it('Adds stake to the proposal to ensure it goes to a vote', async () => {
        await policyProposals.connect(bob).support(addTxToNotifier.address)
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
    
      it('Check that the notifier has the added transaction data', async () => {
        expect(await notifier.transactionsSize()).to.equal(1)
        const tx = await notifier.transactions(0)
        expect(tx.destination).to.equal(l1Bridge.address)
        expect(tx.data).to.equal(await addTxToNotifier.txData())
      })

      it('Checks that the bridge contract has now been rebased', async () => {
        expect(await l1Bridge.rebased()).to.be.true
      })
})