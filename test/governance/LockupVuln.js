/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */
const { expect } = require('chai')

const time = require('../utils/time.ts')
const {
  getCommit,
  getFormattedBallot,
} = require('../../tools/test/currencyGovernanceVote')
const { ecoFixture, policyFor } = require('../utils/fixtures')

describe('Lockup [@group=3]', () => {
  let alice
  let bob
  let charlie
  let policy
  let eco
  let timedPolicies
  let currencyTimer
  let borda
  let faucet
  let lockup

  // 21 days
  const lockupPeriod = 1814400
  const percentInterest = 5

  async function getProposals() {
    const proposalsHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['PolicyProposals']
    )

    const proposalsAddress = await policy.policyFor(proposalsHash)

    return await ethers.getContractAt('PolicyProposals', proposalsAddress)
  }

  async function showLockupDetails() {
    let deposit = await lockup
      .connect(charlie)
      .deposits(await alice.getAddress())
    console.log(`alice:`)
    console.log(`gonsDepositAmt: ${deposit.gonsDepositAmount}`)
    console.log(`delegate: ${deposit.delegate}`)

    deposit = await lockup.connect(charlie).deposits(await bob.getAddress())
    console.log(`bob:`)
    console.log(`gonsDepositAmt: ${deposit.gonsDepositAmount}`)
    console.log(`delegate: ${deposit.delegate}`)
    console.log(``)
  }

  async function showBalancesAndVP() {
    const policyProposals = await getProposals()
    const blockNumber = await time.latestBlock()

    console.log(
      `alice vp: ${await policyProposals.votingPower(
        await alice.getAddress(),
        blockNumber
      )}`
    )
    console.log(
      `alice balance: ${await eco
        .connect(alice)
        .balanceOf(await alice.getAddress())}`
    )
    console.log(
      `bob vp: ${await policyProposals.votingPower(
        await bob.getAddress(),
        blockNumber
      )}`
    )
    console.log(
      `bob balance: ${await eco.connect(bob).balanceOf(await bob.getAddress())}`
    )
    console.log(``)
  }

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie] = accounts
    const trustees = [
      await alice.getAddress(),
      await bob.getAddress(),
      await charlie.getAddress(),
    ]

    ;({ policy, eco, faucet, timedPolicies, currencyTimer } = await ecoFixture(
      trustees
    ))

    borda = await ethers.getContractAt(
      'CurrencyGovernance',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
      )
    )

    // 21 day lockup, 5% interest, and an inflation multiplier of 1
    await borda
      .connect(bob)
      .propose(0, 0, lockupPeriod, percentInterest * 10000000, 1, '')

    await time.increase(3600 * 24 * 10.1)

    const alicevote = [
      ethers.utils.randomBytes(32),
      await alice.getAddress(),
      [await bob.getAddress()],
    ]
    await borda.connect(alice).commit(getCommit(...alicevote))
    const bobvote = [
      ethers.utils.randomBytes(32),
      await bob.getAddress(),
      [await bob.getAddress()],
    ]
    await borda.connect(bob).commit(getCommit(...bobvote))
    await time.increase(3600 * 24 * 3)
    await borda
      .connect(alice)
      .reveal(alicevote[0], getFormattedBallot(alicevote[2]))
    await borda.connect(bob).reveal(bobvote[0], getFormattedBallot(bobvote[2]))
    await time.increase(3600 * 24 * 1)
    await borda.updateStage()
    await borda.compute()

    const generation = await currencyTimer.currentGeneration()
    await timedPolicies.incrementGeneration()

    const lockupAddr = await currencyTimer.lockups(generation)
    lockup = await ethers.getContractAt('Lockup', lockupAddr)

    await faucet.connect(alice).mint(await alice.getAddress(), 100)
    await eco.connect(alice).approve(lockup.address, 100)

    await faucet.connect(bob).mint(await bob.getAddress(), 1000)
    await eco.connect(bob).approve(lockup.address, 1000)
  })

  it('exploits', async () => {
    const policyProposals = await getProposals()
    let blockNumber = await time.latestBlock()

    const aliceInitialVP = await policyProposals.votingPower(
      await alice.getAddress(),
      blockNumber
    )

    const bobInitialVP = await policyProposals.votingPower(
      await bob.getAddress(),
      blockNumber
    )
    // bob deposits 1000 eco into the lockup
    await eco.connect(bob).enableDelegationTo()
    await lockup.connect(bob).deposit(1000)

    // alice deposits 1 eco, delegates to Bob, deposits 99 eco, undelegates from Bob
    await eco.connect(alice)
    await lockup.connect(alice).deposit(80)
    await eco.connect(alice).delegate(await bob.getAddress())
    await lockup.connect(alice).deposit(20)
    await eco.connect(alice).undelegate()

    await showBalancesAndVP()
    await showLockupDetails()

    await lockup.connect(alice).withdraw()

    await showBalancesAndVP()
    await showLockupDetails()

    // again

    // counteract the early withdraw fee
    await faucet.connect(alice).mint(await alice.getAddress(), 5)

    await eco.connect(alice).approve(lockup.address, 100)

    await showBalancesAndVP()

    await eco.connect(alice)
    await lockup.connect(alice).deposit(80)
    await eco.connect(alice).delegate(await bob.getAddress())
    await lockup.connect(alice).deposit(20)
    await eco.connect(alice).undelegate()

    await time.increase(lockupPeriod)
    await lockup.connect(alice).withdraw()
    await lockup.connect(bob).withdraw()
    // expect(await lockup.connect(bob).withdraw()).to.be.revertedWith('amount not available to undelegate')

    await showBalancesAndVP()
    await showLockupDetails()

    blockNumber = await time.latestBlock()

    const aliceFinalVP = await policyProposals.votingPower(
      await alice.getAddress(),
      blockNumber
    )
    const bobFinalVP = await policyProposals.votingPower(
      await bob.getAddress(),
      blockNumber
    )

    // expect(aliceFinalVP).to.be.greaterThan(aliceInitialVP*(100 + percentInterest)/100)
    // expect(bobFinalVP).to.be.lessThan(bobInitialVP)

    expect(aliceFinalVP).to.equal(
      (aliceInitialVP * (100 + percentInterest)) / 100
    )
    expect(bobFinalVP).to.equal((bobInitialVP * (100 + percentInterest)) / 100)
  })
})
