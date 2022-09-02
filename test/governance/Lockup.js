/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */
const { expect } = require('chai')

const time = require('../utils/time.ts')
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

  const hash = (x) =>
    ethers.utils.solidityKeccak256(
      ['bytes32', 'address', 'address[]'],
      [x[0], x[1], x[2]]
    )

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie] = accounts
    const trustedNodes = [
      await alice.getAddress(),
      await bob.getAddress(),
      await charlie.getAddress(),
    ]

    ;({ policy, eco, faucet, timedPolicies, currencyTimer } = await ecoFixture(
      trustedNodes
    ))

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

    // 21 day lockup, 5% interest, and a random inflation multiplier
    await borda
      .connect(bob)
      .propose(0, 0, 1814400, 50000000, proposedInflationMult, '')

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
    await borda.updateStage()
    await borda.compute()

    const generation = await currencyTimer.currentGeneration()
    await timedPolicies.incrementGeneration()

    const lockupAddr = await currencyTimer.lockups(generation)
    lockup = await ethers.getContractAt('Lockup', lockupAddr)

    await faucet.connect(charlie).mint(await charlie.getAddress(), 1000000000)
    await eco.connect(charlie).approve(lockup.address, 1000000000)
  })

  describe('cloning inputs', () => {
    let rawLockup

    it('reverts on calling clone on a clone', async () => {
      await expect(lockup['clone(uint256,uint256)'](1, 2)).to.be.revertedWith(
        'This method cannot be called on clones'
      )
    })

    beforeEach(async () => {
      const implAddress = await currencyTimer.lockupImpl()
      rawLockup = await ethers.getContractAt('Lockup', implAddress)
    })

    it('reverts on zero duration', async () => {
      await expect(
        rawLockup['clone(uint256,uint256)'](0, 2)
      ).to.be.revertedWith('duration should not be zero')
    })

    it('reverts on calling clone on a clone', async () => {
      await expect(
        rawLockup['clone(uint256,uint256)'](1, 0)
      ).to.be.revertedWith('interest should not be zero')
    })
  })

  it('allows deposit', async () => {
    await lockup.connect(charlie).deposit(1000000000)
  })

  it('allows depositFor', async () => {
    await lockup
      .connect(charlie)
      .depositFor(1000000000, await alice.getAddress())
  })

  describe('expect deposit events', async () => {
    it('on deposit', async () => {
      await expect(lockup.connect(charlie).deposit(1000000000))
        .to.emit(lockup, 'Deposit')
        .withArgs(await charlie.getAddress(), '1000000000')
    })

    it('on depositFor', async () => {
      await expect(
        lockup.connect(charlie).depositFor(1000000000, await alice.getAddress())
      )
        .to.emit(lockup, 'Deposit')
        .withArgs(await alice.getAddress(), '1000000000')
    })
  })

  describe('Without a valid deposit', async () => {
    it('reverts on withdraw', async () => {
      await expect(lockup.connect(alice).withdraw()).to.be.revertedWith(
        'Withdrawals can only be made for accounts with valid deposits'
      )
    })
  })

  describe('With a valid deposit', async () => {
    beforeEach(async () => {
      await lockup.connect(charlie).deposit(1000000000)
    })

    it('punishes early withdrawal', async () => {
      await lockup.connect(charlie).withdraw()
      expect(await eco.balanceOf(await charlie.getAddress())).to.equal(
        950000000
      )
    })

    it('does not allow early withdrawFor', async () => {
      await expect(
        lockup.connect(alice).withdrawFor(await charlie.getAddress())
      ).to.be.revertedWith('Only depositor may withdraw early')
    })

    describe('after the deposit window', () => {
      beforeEach(async () => {
        await time.increase(3600 * 24 * 2)
      })

      it('can no longer deposit', async () => {
        await expect(
          lockup.connect(charlie).deposit(1000000000)
        ).to.be.revertedWith('Deposits can only be made during sale window')
      })

      it('still punishes early withdrawal', async () => {
        await lockup.connect(charlie).withdraw()
        expect(await eco.balanceOf(await charlie.getAddress())).to.equal(
          950000000
        )
      })

      it('still does not allow early withdrawFor', async () => {
        await expect(
          lockup.connect(alice).withdrawFor(await charlie.getAddress())
        ).to.be.revertedWith('Only depositor may withdraw early')
      })
    })

    describe('after the lockup window', () => {
      beforeEach(async () => {
        await time.increase(3600 * 24 * 21.1)
      })

      it('rewards late withdrawal', async () => {
        await lockup.connect(charlie).withdraw()
        expect(await eco.balanceOf(await charlie.getAddress())).to.equal(
          1050000000
        )
      })

      it('allows and rewards late withdrawFor', async () => {
        await lockup.connect(alice).withdrawFor(await charlie.getAddress())
        expect(await eco.balanceOf(await charlie.getAddress())).to.equal(
          1050000000
        )
      })

      it('withdrawal event emitted', async () => {
        await expect(lockup.connect(charlie).withdraw())
          .to.emit(lockup, 'Withdrawal')
          .withArgs(await charlie.getAddress(), '1050000000')
      })

      it('cannot withdraw again', async () => {
        await lockup.connect(charlie).withdraw()
        await expect(lockup.connect(charlie).withdraw()).to.be.revertedWith(
          'Withdrawals can only be made for accounts with valid deposits'
        )
      })
    })

    describe('can make multiple deposits', () => {
      beforeEach(async () => {
        await faucet
          .connect(charlie)
          .mint(await charlie.getAddress(), 1000000000)
        await eco.connect(charlie).approve(lockup.address, 1000000000)
        await lockup.connect(charlie).deposit(1000000000)
        await time.increase(3600 * 24 * 21.1)
      })

      it('correctly rewards the aggrergate of deposits', async () => {
        await lockup.connect(charlie).withdraw()
        expect(await eco.balanceOf(await charlie.getAddress())).to.equal(
          2100000000
        )
      })
    })

    describe('with linear inflation during the lockup', () => {
      beforeEach(async () => {
        borda = await ethers.getContractAt(
          'CurrencyGovernance',
          await policyFor(
            policy,
            ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
          )
        )

        // 200% linear inflation
        await borda.connect(bob).propose(0, 0, 0, 0, '500000000000000000', '')
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
        await borda.updateStage()
        await borda.compute()
        await timedPolicies.incrementGeneration()
      })

      describe('after the lockup window', () => {
        beforeEach(async () => {
          await time.increase(3600 * 24 * 7.1)
        })

        it('rewards late withdrawal', async () => {
          await lockup.connect(charlie).withdraw()
          expect(await eco.balanceOf(await charlie.getAddress())).to.equal(
            2050000000
          )
        })
      })
    })
  })

  describe('affirming funds are delegated', () => {
    beforeEach(async () => {
      await lockup.connect(charlie).deposit(1000000000)

      await faucet.connect(alice).mint(await alice.getAddress(), 2000000000)
      await eco.connect(alice).approve(lockup.address, 2000000000)
      await lockup.connect(alice).deposit(2000000000)

      await eco.connect(alice).enableDelegationTo()

      await faucet.connect(bob).mint(await bob.getAddress(), 3000000000)
      await eco.connect(bob).delegate(await alice.getAddress())

      await eco.connect(bob).approve(lockup.address, 1000000000)
      await lockup.connect(bob).deposit(1000000000)
    })

    it('lockup has no voting power', async () => {
      const lockupPower = await eco.getPastVotes(
        lockup.address,
        await time.latestBlock()
      )
      expect(lockupPower).to.equal(0)
    })

    it('users have correct voting power', async () => {
      const alicePower = await eco.getPastVotes(
        alice.address,
        await time.latestBlock()
      )
      const bobPower = await eco.getPastVotes(
        bob.address,
        await time.latestBlock()
      )
      const charliePower = await eco.getPastVotes(
        charlie.address,
        await time.latestBlock()
      )

      expect(alicePower).to.equal(5000000000)
      expect(bobPower).to.equal(0)
      expect(charliePower).to.equal(1000000000)
    })

    describe('bob redelegates', () => {
      beforeEach(async () => {
        await eco.connect(charlie).enableDelegationTo()
        await eco.connect(bob).delegate(await charlie.getAddress())
      })

      it('lockup power stays, unlocked power moves', async () => {
        const alicePower = await eco.getPastVotes(
          alice.address,
          await time.latestBlock()
        )
        const bobPower = await eco.getPastVotes(
          bob.address,
          await time.latestBlock()
        )
        const charliePower = await eco.getPastVotes(
          charlie.address,
          await time.latestBlock()
        )

        expect(alicePower).to.equal(3000000000)
        expect(bobPower).to.equal(0)
        expect(charliePower).to.equal(3000000000)
      })

      it('nonintuitive behavior fixes when bob withdraws', async () => {
        await time.increase(3600 * 24 * 21.1)
        await lockup.connect(bob).withdraw()

        const alicePower = await eco.getPastVotes(
          alice.address,
          await time.latestBlock()
        )
        const bobPower = await eco.getPastVotes(
          bob.address,
          await time.latestBlock()
        )
        const charliePower = await eco.getPastVotes(
          charlie.address,
          await time.latestBlock()
        )

        expect(alicePower).to.equal(2000000000)
        expect(bobPower).to.equal(0)
        expect(charliePower).to.equal(4050000000)
      })
    })
  })
})
