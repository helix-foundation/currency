/*
 * This is an end-to-end demo of policy votes to upgrade a ForwardTarget proxy
 * The TrustedNodes contract is used as an example as it has long lasting data to be proserved
 *
 * Note that this 'test' shares states between the it() functions, and
 * it() is used mostly to break up the logical steps.
 *
 * The purpose of this demo is to propose a policy change that alters the
 * trustee managing contract to add a checkable property to show that the upgrade has been made
 * This kind of proxy upgrade does not change the address stored in the policy.
 */

const { ethers } = require('hardhat')
const time = require('../utils/time.ts')
const { ecoFixture } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')
const util = require('../../tools/test/util')

describe('Proxy Policy Change [@group=9]', () => {
  let policy
  let eco
  let timedPolicies
  let policyProposals
  let policyVotes
  let initInflation

  let implementationUpdatingTarget
  let makeTrustedPoodles
  let poodleTrustedNodes
  let poodleCheck

  let alice
  let bob
  let charlie
  let dave
  let trustednodes

  before('Deploys the production system', async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie, dave] = accounts
    trustednodes = [
      await bob.getAddress(),
      await charlie.getAddress(),
      await dave.getAddress(),
    ]
    ;({
      policy,
      eco,
      faucet: initInflation,
      timedPolicies,
    } = await ecoFixture(trustednodes))
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

  it('Checks that the current trusted nodes contract is not poodles', async () => {
    poodleCheck = await ethers.getContractAt(
      'PoodleTrustedNodes',
      await util.policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['TrustedNodes'])
      )
    )

    // the contract at ID_TRUSTED_NODES is not poodles so it does not have this function
    await expect(poodleCheck.provePoodles()).to.be.reverted
  })

  it('Checks that the current trusted nodes contract has data', async () => {
    const numTrustees = await poodleCheck.numTrustees()

    expect(numTrustees).to.equal(trustednodes.length)
  })

  it('Constructs the proposals', async () => {
    poodleTrustedNodes = await deploy('PoodleTrustedNodes')
    implementationUpdatingTarget = await deploy('ImplementationUpdatingTarget')
    makeTrustedPoodles = await deploy(
      'MakeTrustedPoodles',
      poodleTrustedNodes.address,
      implementationUpdatingTarget.address
    )
    const name = await makeTrustedPoodles.name()
    expect(name).to.equal('MakeTrustedPoodles')
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
      .registerProposal(makeTrustedPoodles.address)

    await time.increase(3600 * 24 * 2)
  })

  it('Adds stake to proposals to ensure they are in the top 10', async () => {
    await policyProposals.connect(alice).support(makeTrustedPoodles.address)
    await policyProposals.connect(bob).support(makeTrustedPoodles.address)
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

  it('Moves to the next generation', async () => {
    await time.increase(3600 * 24 * 7)
    await timedPolicies.incrementGeneration()
  })

  it('Checks that the address has not changed', async () => {
    const trustNodesHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['TrustedNodes']
    )
    const retryPoodleCheckAddress = await util.policyFor(policy, trustNodesHash)
    expect(retryPoodleCheckAddress).to.equal(poodleCheck.address)
  })

  it('Checks that the new trustee contract is poodles', async () => {
    const poodles = await poodleCheck.provePoodles()
    expect(poodles).to.be.true
  })

  it('Checks that the new trustee contract retains all old data', async () => {
    const poodleTrustees = await poodleCheck.numTrustees()
    expect(poodleTrustees).to.equal(trustednodes.length)

    for (let i = 0; i < trustednodes.length; i++) {
      /* eslint-disable no-await-in-loop */
      expect(await poodleCheck.isTrusted(trustednodes[i])).to.be.true
    }
  })
})
