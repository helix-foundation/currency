const { expect } = require('chai')

const { ethers } = require('hardhat')
const time = require('../utils/time.ts')

const { BigNumber } = ethers
const { ecoFixture } = require('../utils/fixtures')

const MAX_ACCOUNT_BALANCE = BigNumber.from(
  '115792089237316195423570985008687907853269984665640564039457' // 584007913129639935', removed as we use 18 digits to store inflation
)

describe('IECO [@group=5]', () => {
  let eco
  let faucet
  let accounts
  let timedPolicies

  before(async () => {
    accounts = await ethers.getSigners()
    accounts.sort(async (a, b) =>
      Number((await a.getAddress()) - (await b.getAddress()))
    )
  })

  beforeEach('global setup', async () => {
    ;({ eco, faucet, timedPolicies } = await ecoFixture([]))
  })

  describe('Decimals', () => {
    it('returns the right number', async () => {
      // assert.equal(await eco.decimals(), 18, 'wrong number');
      expect(await eco.decimals()).to.equal(18, 'no')
    })
  })

  // describe('Initializable', () => {
  //   it('should not allow calling initialize on the base contract', async () => {
  //     await expectRevert(
  //       eco.initialize(eco.address),
  //       'Can only be called during initialization',
  //     );
  //   });

  //   context('when proxied', () => {
  //     let proxiedBalanceStore;

  //     beforeEach(async () => {
  //       proxiedBalanceStore = await IECO.at(
  //         (await ForwardProxy.new(eco.address)).address,
  //       );
  //     });

  //     it('should not allow calling initialize on the proxy', async () => {
  //       await expectRevert(
  //         proxiedBalanceStore.initialize(eco.address),
  //         'Can only be called during initialization',
  //       );
  //     });
  //   });
  // });

  describe('Mintable', () => {
    const mintAmount = BigNumber.from(1000)

    it('should start with 0 balance', async () => {
      const balance = await eco.balanceOf(await accounts[0].getAddress())

      expect(balance).to.equal(BigNumber.from(0))
    })

    it('should start with 0 token supply', async () => {
      const totalSupply = await eco.totalSupply()
      expect(totalSupply).to.equal(BigNumber.from(0))
    })

    context('for the inflation policy', () => {
      context('below MAX_ACCOUNT_BALANCE', async () => {
        it('should increase the balance when minting coins', async () => {
          const startBalance = await eco.balanceOf(
            await accounts[0].getAddress()
          )
          await faucet.mint(await accounts[0].getAddress(), mintAmount)
          const endBalance = await eco.balanceOf(await accounts[0].getAddress())

          expect(endBalance.sub(startBalance)).to.equal(mintAmount)
        })

        it('should increase the overall token supply when minting coins', async () => {
          const startSupply = await eco.totalSupply()
          await faucet.mint(await accounts[1].getAddress(), mintAmount)
          const endSupply = await eco.totalSupply()

          expect(endSupply.sub(startSupply)).to.equal(mintAmount)
        })
      })

      context('overflowing Weight', () => {
        const nearMaxUint256 = MAX_ACCOUNT_BALANCE.sub(BigNumber.from(500))

        it('should throw when minting coins that would create an unsafe cast for checkpoints', async () => {
          await expect(
            faucet.mint(await accounts[1].getAddress(), nearMaxUint256)
          ).to.be.reverted
        })
      })
    })

    context('for an unauthorized user', () => {
      it('should revert when minting coins', async () => {
        await expect(
          eco.connect(accounts[1]).mint(await accounts[1].getAddress(), 1000)
        ).to.be.revertedWith('not authorized')
      })

      it('should not increase the balance when reverting minting coins', async () => {
        const startBalance = await eco.balanceOf(await accounts[1].getAddress())
        await expect(
          eco.connect(accounts[1]).mint(await accounts[1].getAddress(), 1000)
        ).to.be.reverted
        const endBalance = await eco.balanceOf(await accounts[1].getAddress())

        expect(endBalance).to.equal(startBalance)
      })

      it('should not increase the supply when reverting minting coins', async () => {
        const startSupply = await eco.balanceOf(await accounts[1].getAddress())
        await expect(
          eco.connect(accounts[1]).mint(await accounts[1].getAddress(), 1000)
        ).to.be.reverted
        const endSupply = await eco.balanceOf(await accounts[1].getAddress())

        expect(endSupply).to.equal(startSupply)
      })
    })
  })

  describe('Burnable', () => {
    const burnAmount = BigNumber.from(1000)

    context('for yourself', () => {
      it('should succeed with a balance', async () => {
        await faucet.mint(await accounts[1].getAddress(), burnAmount)
        const preBalance = await eco.balanceOf(await accounts[1].getAddress())
        await eco
          .connect(accounts[1])
          .burn(await accounts[1].getAddress(), burnAmount)
        const postBalance = await eco.balanceOf(await accounts[1].getAddress())
        expect(preBalance - postBalance).to.equal(burnAmount)
      })

      it('should decrease total supply', async () => {
        await faucet.mint(await accounts[1].getAddress(), burnAmount)
        const preSupply = await eco.totalSupply()
        await eco
          .connect(accounts[1])
          .burn(await accounts[1].getAddress(), burnAmount)
        const postSupply = await eco.totalSupply()
        expect(preSupply - postSupply).to.equal(burnAmount)
      })
    })

    context('for another user', () => {
      it('sound revert', async () => {
        await expect(
          eco
            .connect(accounts[2])
            .burn(await accounts[1].getAddress(), burnAmount)
        ).to.be.revertedWith('not authorized')
      })
    })
  })

  describe('Generations', () => {
    context('when the store is not ready for a generation update', () => {
      it('does not allow incrementing generations', async () => {
        await expect(timedPolicies.incrementGeneration()).to.be.revertedWith(
          'please try later'
        )
      })
    })

    context('when the store is ready for a generation update', () => {
      let originalGeneration

      beforeEach(async () => {
        originalGeneration = (await eco.currentGeneration()).toNumber()
        await time.increase(31557600 / 10)
      })

      it('allows incrementing generations', async () => {
        await timedPolicies.incrementGeneration()
        assert.equal(
          (await eco.currentGeneration()).toNumber(),
          originalGeneration + 1
        )
      })
    })

    context('when generation has not increased', () => {
      it('reverts when call notifyGenerationIncrease', async () => {
        await expect(eco.notifyGenerationIncrease()).to.be.revertedWith(
          'Generation has not increased'
        )
      })
    })

    context('for a stale account', () => {
      let testAccount
      let originalGeneration
      let blockNumber
      let initialBalance

      beforeEach(async () => {
        testAccount = await accounts[1].getAddress()
        await faucet.mint(testAccount, BigNumber.from(1000))
        blockNumber = await time.latestBlock()
        await time.advanceBlock()
        originalGeneration = (await eco.currentGeneration()).toNumber()
        initialBalance = await eco.getPastVotes(
          await accounts[1].getAddress(),
          blockNumber
        )

        await time.increase(31557600 / 10)
        await timedPolicies.incrementGeneration()
      })

      it('reports a generation other than the original', async () => {
        expect(await eco.currentGeneration()).to.not.equal(originalGeneration)
      })

      it('uses the last-updated block number for old balances', async () => {
        expect(
          await eco.getPastVotes(testAccount, (await time.latestBlock()) - 1)
        ).to.be.equal(initialBalance)
      })

      it('uses the last-updated block number as the balance', async () => {
        expect(await eco.balanceOf(testAccount)).to.be.equal(initialBalance)
      })
    })

    it('Cannot return future balances', async () => {
      await expect(
        eco.getPastVotes(await accounts[1].getAddress(), 999999999)
      ).to.be.revertedWith('InflationCheckpoints: block not yet mined')
    })

    context('after a long time', () => {
      let testAccount
      let blockNumber
      let initialBalance

      beforeEach('set things up and let some time pass', async () => {
        testAccount = await accounts[1].getAddress()
        await faucet.mint(testAccount, BigNumber.from(1000))
        blockNumber = await time.latestBlock()
        await time.advanceBlock()
        initialBalance = await eco.getPastVotes(testAccount, blockNumber)

        // 12 months pass...
        for (let i = 0; i <= 12; i += 1) {
          /* eslint-disable no-await-in-loop */
          await time.increase(31557600 / 10, await accounts[0].getAddress())
          await timedPolicies.incrementGeneration()
          /* eslint-enable no-await-in-loop */
        }
      })

      it('preserves orignal balance', async () => {
        expect(await eco.getPastVotes(testAccount, blockNumber)).to.equal(
          initialBalance
        )
      })

      context('after even longer', () => {
        let intermediateBlockNumber
        let intermediateBalance

        beforeEach(async () => {
          intermediateBlockNumber = await time.latestBlock()
          intermediateBalance = await eco.balanceOf(testAccount)

          // 12 months pass...
          for (let i = 0; i <= 12; i += 1) {
            /* eslint-disable no-await-in-loop */
            await time.increase(31557600 / 10)
            await timedPolicies.incrementGeneration()
            /* eslint-enable no-await-in-loop */
          }
        })

        it('preserves orignal balance', async () => {
          expect(
            await eco.getPastVotes(testAccount, intermediateBlockNumber)
          ).to.equal(intermediateBalance)
        })
      })
    })

    context('after 3 checkpoints', () => {
      let testAccount1
      let testAccount2

      const testAccount1Balances = [0, 1000, 2000, 3000]
      const testAccount2Balances = [0, 1000, 1000, 2000]

      before(async () => {
        const [, acc1, acc2] = accounts
        testAccount1 = await acc1.getAddress()
        testAccount2 = await acc2.getAddress()
      })

      it('Accounts have correct balances for the appropriate checkpoints', async () => {
        const checkPoints = [await time.latestBlock()]

        for (let i = 0; i < 3; i += 1) {
          /* eslint-disable no-await-in-loop */
          if (i !== 1) {
            await faucet.mint(testAccount2, BigNumber.from(1000))
          }
          await faucet.mint(testAccount1, BigNumber.from(1000))
          checkPoints.push(await time.latestBlock())
          await time.advanceBlock()
        }

        for (let i = 0; i < 3; i += 1) {
          const account1Balance = await eco.getPastVotes(
            testAccount1,
            checkPoints[i]
          )
          expect(account1Balance).to.equal(testAccount1Balances[i])

          const account2Balance = await eco.getPastVotes(
            testAccount2,
            checkPoints[i]
          )
          expect(account2Balance).to.equal(testAccount2Balances[i])
        }
      })
    })
  })
})
