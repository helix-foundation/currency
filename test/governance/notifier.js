const { expect } = require('chai')

const time = require('../utils/time.ts')
const {
  getCommit,
  getFormattedBallot,
} = require('../../tools/test/currencyGovernanceVote')
const { ecoFixture, policyFor } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('Lockup [@group=3]', () => {
  let alice
  let bob
  let charlie
  let policy
  let eco
  let ecox
  let timedPolicies
  let currencyTimer
  let borda
  let faucet
  let notifier
  let amm

  const stake = ethers.utils.parseEther('200000000')

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie] = accounts
    const trustees = [
      await alice.getAddress(),
      await bob.getAddress(),
      await charlie.getAddress(),
    ]

    ;({ policy, eco, ecox, faucet, timedPolicies, currencyTimer } = await ecoFixture(
      trustees
    ))

    await initInflation.mint(await alice.getAddress(), stake)
    await initInflation.mint(await bob.getAddress(), stake)
    await initInflation.mint(await charlie.getAddress(), stake)

    notifier = await deploy('Notifier', policy.address)
    amm = await deploy('DummyAMMPool', eco.address, ecox.address)
    await amm.sync()
  })

  it('test notifying working correctly', async () => {
    borda = await ethers.getContractAt(
      'CurrencyGovernance',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
      )
    )

    const digits1to9 = Math.floor(Math.random() * 900000000) + 100000000
    const digits10to19 = Math.floor(Math.random() * 10000000000)
    const proposedInflationMult = `${digits10to19}${digits1to9}`

    // propose a random inflation multiplier
    await borda
      .connect(bob)
      .propose(0, 0, 0, 0, proposedInflationMult, '')

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

    await faucet.connect(charlie).mint(await charlie.getAddress(), 1000000000)
    await eco.connect(charlie).approve(lockup.address, 1000000000)
  })
})