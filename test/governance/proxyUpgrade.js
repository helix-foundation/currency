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

const { expect } = require('chai')
const time = require('../utils/time.ts')
const { ecoFixture, policyFor } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('E2E Proxied Contract Upgrade [@group=9]', () => {
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
  let trustedNodes

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

  it('Checks that the current trusted nodes contract is not poodles', async () => {
    poodleCheck = await ethers.getContractAt(
      'PoodleTrustedNodes',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['TrustedNodes'])
      )
    )

    // the contract at ID_TRUSTED_NODES is not poodles so it does not have this function
    await expect(poodleCheck.provePoodles()).to.be.reverted
  })

  it('Checks that the current trusted nodes contract has data', async () => {
    const numTrustees = await poodleCheck.numTrustees()

    expect(numTrustees).to.equal(trustedNodes.length)
  })

  it('Constructs the proposal', async () => {
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
      .registerProposal(makeTrustedPoodles.address)
  })

  it('Adds stake to the proposal to ensure it goes to a vote', async () => {
    await policyProposals.connect(alice).support(makeTrustedPoodles.address)
    await policyProposals.connect(bob).support(makeTrustedPoodles.address)
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

  it('Checks that the address has not changed', async () => {
    const trustNodesHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['TrustedNodes']
    )
    const retryPoodleCheckAddress = await policyFor(policy, trustNodesHash)
    expect(retryPoodleCheckAddress).to.equal(poodleCheck.address)
  })

  it('Checks that the new trustee contract is poodles', async () => {
    const poodles = await poodleCheck.provePoodles()
    expect(poodles).to.be.true
  })

  it('Checks that the new trustee contract retains all old data', async () => {
    const poodleTrustees = await poodleCheck.numTrustees()
    expect(poodleTrustees).to.equal(trustedNodes.length)

    for (let i = 0; i < trustedNodes.length; i++) {
      /* eslint-disable no-await-in-loop */
      expect(await poodleCheck.isTrusted(trustedNodes[i])).to.be.true
    }
  })
})
