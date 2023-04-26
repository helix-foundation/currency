/*
 * This is a test of the proposal: FixGenerationDrift.propo.sol
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

describe('E2E Proxied Contract Upgrade [@group=2]', () => {
  let policy
  let eco
  let ecox
  let timedPolicies
  let currencyGovernance
  let policyProposals
  let policyVotes
  let initInflation

  let newTimedPolicies
  let newPolicyProposals
  let newCurrencyGovernance

  let switcherTimedPolicies
  let switcherCurrencyTimer
  let implementationUpdatingTarget

  let proposal

  let alice
  let bob
  let charlie
  let dave
  let trustedNodes

  // amount of ECOx for staking into ECOxStaking
  const staked = ethers.utils.parseEther('50')
  // amount of ECO to mint for each account
  const stake = ethers.utils.parseEther('5000000')

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
      currencyTimer,
      faucet: initInflation,
      timedPolicies,
    } = await ecoFixture(trustedNodes))
  })

  it('Stakes accounts', async () => {
    await initInflation.mint(await alice.getAddress(), stake)
    await initInflation.mint(await bob.getAddress(), stake)
    await initInflation.mint(await charlie.getAddress(), stake)
    await initInflation.mint(await dave.getAddress(), stake)
  })

  it('Waits a generation', async () => {
    await time.increase(3600 * 24 * 14)
    await timedPolicies.incrementGeneration()
  })

  it('Checks that the current contracts are not poodles', async () => {
    const tp = await ethers.getContractAt(
      'PoodleTimedPolicies',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['TimedPolicies'])
      )
    )

    const cg = await ethers.getContractAt(
      'PoodleCurrencyGovernance',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
      )
    )

    const pp = await ethers.getContractAt(
      'PoodlePolicyProposals',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['PolicyProposals'])
      )
    )

    // these shouldnt be poodles rn, so poke should revert
    await expect(tp.poke()).to.be.reverted
    await expect(pp.poke()).to.be.reverted
    await expect(cg.poke()).to.be.reverted
  })

  it.only('Constructs the proposal', async () => {

    const oldPolicyProposals = 
    newPolicyProposals = await deploy(
      'PoodlePolicyProposals',
      policy.address,
      await(
        await ethers.getContractAt(
          'PolicyProposals',
          await policyFor(
            policy,
            ethers.utils.solidityKeccak256(['string'], ['PolicyProposals'])
          )
        )
      ).policyVotesImpl(),
      eco.address
    )

    console.log(1)

    const randomBytes32 = ['0x9f24c52e0fcd1ac696d00405c3bd5adc558c48936919ac5ab3718fcb7d70f93f']
    newTimedPolicies = await deploy(
      'PoodleTimedPolicies',
      policy.address,
      newPolicyProposals.address,
      randomBytes32
    )

    console.log(2)

    newCurrencyGovernance = await deploy(
      'PoodleCurrencyGovernance',
      policy.address,
      await(
        await ethers.getContractAt(
          'CurrencyGovernance',
          await policyFor(
            policy,
            ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
          )
        )
      ).pauser()
    )

    console.log(3)

    implementationUpdatingTarget = await deploy('ImplementationUpdatingTarget')
    switcherCurrencyTimer = await deploy('SwitcherCurrencyTimer')

    console.log(4)

    proposal = await deploy(
      'FixGenerationDrift',
      implementationUpdatingTarget.address,
      switcherCurrencyTimer.address,
      ethers.constants.AddressZero, //switcherTimedPolicies, not necessary idt
      newTimedPolicies.address,
      newCurrencyGovernance.address,
      ethers.constants.AddressZero //new policyProposals, not necessary idt
    )

    expect (await proposal.name()).to.eq('Prevent Generation Drift')
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

  it('Checks that the ecoxstaking address has changed', async () => {
    const stakingHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['ECOxStaking']
    )
    newECOxStaking = await ethers.getContractAt(
      'PoodlexStaking',
      await policyFor(policy, stakingHash)
    )
    expect(newECOxStaking.address).to.not.equal(ecoXStaking.address)
    expect(newECOxStaking.address).to.equal(proxyPoodlexStaking.address)
    expect(await newECOxStaking.implementation()).to.equal(
      poodlexStaking.address
    )
  })

  it('Checks that the ECO address is the same', async () => {
    const ecoHash = ethers.utils.solidityKeccak256(['string'], ['ECO'])
    newECO = await ethers.getContractAt(
      'PoodleECO',
      await policyFor(policy, ecoHash)
    )
    expect(newECO.address).to.equal(eco.address)
  })

  it('Checks that the new contracts are poodles', async () => {
    const poodles1 = await newECOxStaking.provePoodles()
    expect(poodles1).to.be.true
    const poodles2 = await newECO.provePoodles()
    expect(poodles2).to.be.true
  })

  it('verifies that the ECO contract is as expected', async () => {
    expect(await newECO.implementation()).to.equal(poodleECO.address)
    expect(await newECO.pauser()).to.equal(
      '0xDEADBEeFbAdf00dC0fFee1Ceb00dAFACEB00cEc0'
    )
    expect(await newECO.balanceOf(alice.getAddress())).to.equal(
      stake.sub(await policyProposals.COST_REGISTER())
    )
    expect(await newECO.balanceOf(bob.getAddress())).to.equal(stake)
    expect(await newECO.balanceOf(charlie.getAddress())).to.equal(stake)
    expect(await newECO.balanceOf(dave.getAddress())).to.equal(stake)
    expect(await newECO.totalSupply()).to.equal(stake.mul(4))
  })
})
