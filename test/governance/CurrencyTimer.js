/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */



const { ethers } = require('hardhat')
const time = require('../utils/time.ts')

const { BigNumber } = ethers
const { ecoFixture } = require('../utils/fixtures')
const util = require('../../tools/test/util')

describe('CurrencyTimer [@group=4]', () => {
  let alice
  let bob
  let charlie
  let policy
  let eco
  let timedPolicies
  let currencyTimer
  let borda
  let faucet

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie] = accounts
    const trustednodes = [
      await alice.getAddress(),
      await bob.getAddress(),
      await charlie.getAddress(),
    ]

    ;({ policy, eco, timedPolicies, currencyTimer, faucet } = await ecoFixture(
      trustednodes
    ))

    borda = await ethers.getContractAt(
      'CurrencyGovernance',
      await util.policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
      )
    )
  })

  describe('reverts', () => {
    it('cannot be called early', async () => {
      await expect(currencyTimer.notifyGenerationIncrease()).to.be.revertedWith(
        'Generation has not increased'
      )
    })

    it('cannot call lockupWithdrawal', async () => {
      await expect(
        currencyTimer
          .connect(alice)
          .lockupWithdrawal(await alice.getAddress(), 10000, false)
      ).to.be.revertedWith('Not authorized to call this function')
    })
  })

  describe('With a valid vote', () => {
    const hash = (x) =>
      ethers.utils.solidityKeccak256(
        ['bytes32', 'address', 'address[]'],
        [x[0], x[1], x[2]]
      )

    const proposedInflationMult = BigNumber.from('1100000000000000000')
    const aliceBal = BigNumber.from(1000000000)

    beforeEach(async () => {
      await faucet.mint(await alice.getAddress(), aliceBal)

      await borda
        .connect(bob)
        .propose(10, 20, 30, 40, proposedInflationMult, '')
      await time.increase(3600 * 24 * 10.1)

      const alicevote = [
        ethers.utils.randomBytes(32),
        await alice.getAddress(),
        [await bob.getAddress()],
      ]
      await borda.connect(alice).commit(hash(alicevote))
      const bobvote = [
        ethers.utils.randomBytes(32),
        await bob.getAddress(),
        [await bob.getAddress()],
      ]
      await borda.connect(bob).commit(hash(bobvote))
      await time.increase(3600 * 24 * 3)
      await borda.connect(alice).reveal(alicevote[0], alicevote[2])
      await borda.connect(bob).reveal(bobvote[0], bobvote[2])
      await time.increase(3600 * 24 * 1)
    })

    context('without compute', () => {
      beforeEach(async () => {
        const generation = await timedPolicies.generation()
        await expect(timedPolicies.incrementGeneration())
          .to.emit(currencyTimer, 'NewCurrencyGovernance')
          .withArgs(
            await util.policyFor(
              policy,
              ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
            ),
            generation.add(1)
          )
      })

      it('changed borda', async () => {
        expect(
          await util.policyFor(
            policy,
            ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
          )
        ).to.not.equal(borda.address)
      })

      it('has inflation', async () => {
        const [evt] = await currencyTimer.queryFilter('NewInflation')
        const infl = await ethers.getContractAt(
          'RandomInflation',
          evt.args.addr
        )
        expect(await infl.reward()).to.equal(20)
        expect(await infl.numRecipients()).to.equal(10)
        expect(await eco.balanceOf(infl.address)).to.equal(200)
      })

      it('has lockup', async () => {
        const [evt] = await currencyTimer.queryFilter('NewLockup')
        const lockup = await ethers.getContractAt('Lockup', evt.args.addr)
        expect(await eco.balanceOf(lockup.address)).to.equal(0)

        await faucet
          .connect(charlie)
          .mint(await charlie.getAddress(), 1000000000)
        await eco.connect(charlie).approve(lockup.address, 1000000000)
        await lockup.connect(charlie).deposit(1000000000)
        expect(await eco.balanceOf(lockup.address)).to.equal(1000000000)

        expect(await currencyTimer.isLockup(lockup.address)).to.be.true
      })

      it('has new inflation', async () => {
        const [evt] = await eco.queryFilter('NewInflationMultiplier')
        expect(evt.args.inflationMultiplier).to.equal(proposedInflationMult)
        const newAliceBal = await eco.balanceOf(await alice.getAddress())
        const inflationDigits = await eco.INITIAL_INFLATION_MULTIPLIER()
        expect(newAliceBal).to.equal(
          BigNumber.from(aliceBal)
            .mul(inflationDigits)
            .div(proposedInflationMult)
        )
      })
    })

    context('with compute', () => {
      beforeEach(async () => {
        await borda.updateStage()
        await borda.compute()
        const generation = await timedPolicies.generation()
        await expect(timedPolicies.incrementGeneration())
          .to.emit(currencyTimer, 'NewCurrencyGovernance')
          .withArgs(
            await util.policyFor(
              policy,
              ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
            ),
            generation.add(1)
          )
      })

      it('changed borda', async () => {
        expect(
          await util.policyFor(
            policy,
            ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
          )
        ).to.not.equal(borda.address)
      })

      it('has inflation', async () => {
        const [evt] = await currencyTimer.queryFilter('NewInflation')
        const infl = await ethers.getContractAt(
          'RandomInflation',
          evt.args.addr
        )
        expect(await infl.reward()).to.equal(20)
        expect(await infl.numRecipients()).to.equal(10)
        expect(await eco.balanceOf(infl.address)).to.equal(200)
      })

      it('has lockup', async () => {
        const [evt] = await currencyTimer.queryFilter('NewLockup')
        const lockup = await ethers.getContractAt('Lockup', evt.args.addr)
        expect(await eco.balanceOf(lockup.address)).to.equal(0)

        await faucet
          .connect(charlie)
          .mint(await charlie.getAddress(), 1000000000)
        await eco.connect(charlie).approve(lockup.address, 1000000000)
        await lockup.connect(charlie).deposit(1000000000)
        expect(await eco.balanceOf(lockup.address)).to.equal(1000000000)

        expect(await currencyTimer.isLockup(lockup.address)).to.be.true
      })

      it('has new inflation', async () => {
        const [evt] = await eco.queryFilter('NewInflationMultiplier')
        expect(evt.args.inflationMultiplier).to.equal(proposedInflationMult)
        const newAliceBal = await eco.balanceOf(await alice.getAddress())
        const inflationDigits = await eco.INITIAL_INFLATION_MULTIPLIER()
        expect(newAliceBal).to.equal(
          BigNumber.from(aliceBal)
            .mul(inflationDigits)
            .div(proposedInflationMult)
        )
      })
    })
  })
})
