const { expect } = require('chai')
const { ethers } = require('hardhat')
const time = require('../utils/time.ts')
const { ecoFixture } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')
const util = require('../../tools/test/util')

describe('Governance Policy Change [@group=9]', () => {
  let policy
  let eco
  let timedPolicies
  let policyProposals
  let policyVotes
  let initInflation

  let proposal
  let wrapper
  let wrapperProxy
  let poodleWrapper

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
    } = await ecoFixture([
      await bob.getAddress(),
      await charlie.getAddress(),
      await dave.getAddress(),
    ]))
  })

  it('Deploys the wrapper and its proxy', async () => {
    wrapper = await deploy('Wrapper')

    wrapperProxy = await deploy('OZProxy', wrapper.address, policy.address)
    const whoiamunsafe = await wrapperProxy.connect(alice).whoAmINonAdmin()
    expect(whoiamunsafe).to.equal(4)
  })

  it('checks that the proxy works correctly', async () => {
    const proxiedWrapper = await ethers.getContractAt(
      'Wrapper',
      wrapperProxy.address
    )

    await expect(proxiedWrapper.connect(alice).whoAmI())
      .to.emit(proxiedWrapper, 'HereIAm')
      .withArgs(1)
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
    await time.increase(3600 * 24 * 14)
    await timedPolicies.incrementGeneration()
  })

  it('Constructs the proposals', async () => {
    poodleWrapper = await deploy('UpgradedWrapper')

    proposal = await deploy(
      'WrapperUpgradeProposal',
      poodleWrapper.address,
      wrapperProxy.address
    )
    const name = await proposal.name()
    expect(name).to.equal('I am the wrapper upgrade proposal')
    const description = await proposal.description()
    expect(description).to.equal('I upgrade the wrapper to say it is poodled')
    const url = await proposal.url()
    expect(url).to.equal('www.wrapper-upgrayedd.com')
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
    await policyProposals.connect(alice).registerProposal(proposal.address)
  })

  it('Adds stake to proposals', async () => {
    await policyProposals.connect(alice).support(proposal.address)
    await policyProposals.connect(bob).support(proposal.address)
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

  it('Waits 4 day (end of voting + delay period)', async () => {
    await time.increase(3600 * 24 * 4)
  })

  it('Executes the outcome of the votes', async () => {
    await policyVotes.execute()
  })

  it('Checks that the new wrapper is poodles', async () => {
    const proxiedWrapper = await ethers.getContractAt(
      'UpgradedWrapper',
      wrapperProxy.address
    )

    await expect(proxiedWrapper.connect(alice).whoAmI())
      .to.emit(proxiedWrapper, 'HereIAm')
      .withArgs(2)
  })
})
