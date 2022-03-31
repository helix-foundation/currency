const chai = require('chai');

const {
  BN,
} = web3.utils;
const bnChai = require('bn-chai');

const {
  expect,
} = chai;

// const ForwardProxy = artifacts.require('ForwardProxy');
// const EcoBalanceStore = artifacts.require('ECO');
// const CurrencyGovernance = artifacts.require('CurrencyGovernance');

const MAX_ACCOUNT_BALANCE = new BN(
  '115792089237316195423570985008687907853269984665640564039457', // 584007913129639935', removed as we use 18 digits to store inflation
);
const {
  expectRevert,
  time,
} = require('@openzeppelin/test-helpers');

const util = require('../../tools/test/util');

chai.use(bnChai(BN));

contract('EcoBalanceStore [@group=5]', (unsortedAccounts) => {
  let balanceStore;
  let faucet;
  const accounts = Array.from(unsortedAccounts);
  accounts.sort((a, b) => Number(a - b));
  let timedPolicies;
  let counter = 0;

  beforeEach('global setup', async () => {
    ({
      // token,
      timedPolicies,
      balanceStore,
      // currencyTimer,
      faucet,
    } = await util.deployPolicy(accounts[counter]));
    counter += 1;

    // borda = await CurrencyGovernance.at(
    //   await util.policyFor(policy, await timedPolicies.ID_CURRENCY_GOVERNANCE()),
    // );
  });

  describe('Decimals', () => {
    it('returns the right number', async () => {
      const balanceStoreDecimals = (await balanceStore.decimals()).toNumber();
      // assert.equal(await balanceStore.decimals(), 18, 'wrong number');
      expect(balanceStoreDecimals).to.equal(18, 'no');
    });
  });

  // describe('Initializable', () => {
  //   it('should not allow calling initialize on the base contract', async () => {
  //     await expectRevert(
  //       balanceStore.initialize(balanceStore.address),
  //       'Can only be called during initialization',
  //     );
  //   });

  //   context('when proxied', () => {
  //     let proxiedBalanceStore;

  //     beforeEach(async () => {
  //       proxiedBalanceStore = await EcoBalanceStore.at(
  //         (await ForwardProxy.new(balanceStore.address)).address,
  //       );
  //     });

  //     it('should not allow calling initialize on the proxy', async () => {
  //       await expectRevert(
  //         proxiedBalanceStore.initialize(balanceStore.address),
  //         'Can only be called during initialization',
  //       );
  //     });
  //   });
  // });

  describe('Mintable', () => {
    const mintAmount = new BN(1000);

    it('should start with 0 balance', async () => {
      const balance = await balanceStore.balance(accounts[0]);

      expect(balance).to.be.zero;
    });

    it('should start with 0 token supply', async () => {
      const tokenSupply = await balanceStore.tokenSupply();
      expect(tokenSupply).to.be.zero;
    });

    context('for the inflation policy', () => {
      context('below MAX_ACCOUNT_BALANCE', async () => {
        it('should increase the balance when minting coins', async () => {
          const startBalance = await balanceStore.balance(accounts[0]);
          await faucet.mint(
            accounts[0],
            mintAmount,
          );
          const endBalance = await balanceStore.balance(accounts[0]);

          expect(endBalance.sub(startBalance)).to.eq.BN(mintAmount);
        });

        it(
          'should increase the overall token supply when minting coins',
          async () => {
            const startSupply = await balanceStore.tokenSupply();
            await faucet.mint(
              accounts[1],
              mintAmount,
            );
            const endSupply = await balanceStore.tokenSupply();

            expect(endSupply.sub(startSupply)).to.eq.BN(mintAmount);
          },
        );
      });

      context('overflowing Weight', () => {
        const nearMaxUint256 = MAX_ACCOUNT_BALANCE.sub(new BN(500));

        it('should throw when minting coins that would create an unsafe cast for checkpoints', async () => {
          await expectRevert.unspecified(
            faucet.mint(accounts[1], nearMaxUint256),
          );
        });
      });
    });

    context('for an unauthorized user', () => {
      const meta = {
        from: accounts[1],
      };

      it('should revert when minting coins', async () => {
        await expectRevert(
          balanceStore.mint(accounts[1], 1000, meta),
          'not authorized',
        );
      });

      it('should not increase the balance when reverting minting coins', async () => {
        const startBalance = await balanceStore.balance(accounts[1]);
        await expectRevert.unspecified(balanceStore.mint(accounts[1], 1000, meta));
        const endBalance = await balanceStore.balance(accounts[1]);

        expect(endBalance).to.eq.BN(startBalance);
      });

      it('should not increase the supply when reverting minting coins', async () => {
        const startSupply = await balanceStore.balance(accounts[1]);
        await expectRevert.unspecified(balanceStore.mint(accounts[1], 1000, meta));
        const endSupply = await balanceStore.balance(accounts[1]);

        expect(endSupply).to.eq.BN(startSupply);
      });
    });
  });

  describe('Burnable', () => {
    const burnAmount = new BN(1000);

    context('for yourself', () => {
      const meta = {
        from: accounts[1],
      };

      it('should succeed with a balance', async () => {
        await faucet.mint(accounts[1], burnAmount);
        const preBalance = await balanceStore.balance(accounts[1]);
        await balanceStore.burn(accounts[1], burnAmount, meta);
        const postBalance = await balanceStore.balance(accounts[1]);
        expect(preBalance - postBalance).to.eq.BN(burnAmount);
      });

      it('should decrease total supply', async () => {
        await faucet.mint(accounts[1], burnAmount);
        const preSupply = await balanceStore.totalSupply();
        await balanceStore.burn(accounts[1], burnAmount, meta);
        const postSupply = await balanceStore.totalSupply();
        expect(preSupply - postSupply).to.eq.BN(burnAmount);
      });
    });

    context('for another user', () => {
      const meta = {
        from: accounts[2],
      };

      it('sound revert', async () => {
        await expectRevert(
          balanceStore.burn(accounts[1], burnAmount, meta),
          'not authorized',
        );
      });
    });
  });

  describe('Generations', () => {
    context('when the store is not ready for a generation update', () => {
      it('does not allow incrementing generations', async () => {
        await expectRevert(
          timedPolicies.incrementGeneration(),
          'please try later',
        );
      });
    });

    context('when the store is ready for a generation update', () => {
      let originalGeneration;

      beforeEach(async () => {
        originalGeneration = (await balanceStore.currentGeneration()).toNumber();
        await time.increase(31557600 / 10);
      });

      it('allows incrementing generations', async () => {
        await timedPolicies.incrementGeneration();
        assert.equal(
          (await balanceStore.currentGeneration()).toNumber(),
          originalGeneration + 1,
        );
      });
    });

    context('when generation has not increased', () => {
      it('reverts when call notifyGenerationIncrease', async () => {
        await expectRevert(
          balanceStore.notifyGenerationIncrease(),
          'Generation has not increased',
        );
      });
    });

    context('for a stale account', () => {
      const [, testAccount] = accounts;
      let originalGeneration;
      let blockNumber;
      let initialBalance;

      beforeEach(async () => {
        await faucet.mint(testAccount, new BN(1000));
        blockNumber = await time.latestBlock();
        await time.advanceBlock();
        originalGeneration = (await balanceStore.currentGeneration()).toNumber();
        initialBalance = await balanceStore.balanceAt(
          accounts[1],
          blockNumber,
        );

        await time.increase(31557600 / 10, accounts[0]);
        await timedPolicies.incrementGeneration();
      });

      it('reports a generation other than the original', async () => {
        expect(await balanceStore.currentGeneration())
          .to.not.eq.BN(originalGeneration);
      });

      it('uses the last-updated block number for old balances', async () => {
        expect(
          await balanceStore.balanceAt(
            testAccount,
            (await time.latestBlock()) - 1,
          ),
        ).to.be.eq.BN(initialBalance);
      });

      it('uses the last-updated block number as the balance', async () => {
        expect(await balanceStore.balance(testAccount))
          .to.be.eq.BN(initialBalance);
      });
    });

    it('Cannot return future balances', async () => {
      await expectRevert(
        balanceStore.balanceAt(accounts[1], 999999999),
        'InflationCheckpoints: block not yet mined',
      );
    });

    context('after a long time', () => {
      const [, testAccount] = accounts;
      let blockNumber;
      let initialBalance;

      beforeEach('set things up and let some time pass', async () => {
        await faucet.mint(testAccount, new BN(1000));
        blockNumber = await time.latestBlock();
        await time.advanceBlock();
        initialBalance = await balanceStore.balanceAt(
          testAccount,
          blockNumber,
        );

        // 12 months pass...
        for (let i = 0; i <= 12; i += 1) {
          /* eslint-disable no-await-in-loop */
          await time.increase(31557600 / 10, accounts[0]);
          await timedPolicies.incrementGeneration();
          /* eslint-enable no-await-in-loop */
        }
      });

      it('preserves orignal balance', async () => {
        expect(await balanceStore.balanceAt(testAccount, blockNumber))
          .to.eq.BN(initialBalance);
      });

      context('after even longer', () => {
        let intermediateBlockNumber;
        let intermediateBalance;

        beforeEach(async () => {
          intermediateBlockNumber = await time.latestBlock();
          intermediateBalance = await balanceStore.balance(testAccount);

          // 12 months pass...
          for (let i = 0; i <= 12; i += 1) {
            /* eslint-disable no-await-in-loop */
            await time.increase(31557600 / 10, accounts[0]);
            await timedPolicies.incrementGeneration();
            /* eslint-enable no-await-in-loop */
          }
        });

        it('preserves orignal balance', async () => {
          expect(
            await balanceStore.balanceAt(
              testAccount,
              intermediateBlockNumber,
            ),
          ).to.eq.BN(intermediateBalance);
        });
      });
    });

    context('after 3 checkpoints', () => {
      const [, testAccount1, testAccount2] = accounts;

      const testAccount1Balances = [0, 1000, 2000, 3000];
      const testAccount2Balances = [0, 1000, 1000, 2000];

      it(
        'Accounts have correct balances for the appropriate checkpoints',
        async () => {
          const checkPoints = [await time.latestBlock()];

          for (let i = 0; i < 3; i += 1) {
            /* eslint-disable no-await-in-loop */
            if (i !== 1) {
              await faucet.mint(testAccount2, new BN(1000));
            }
            await faucet.mint(testAccount1, new BN(1000));
            checkPoints.push(await time.latestBlock());
            await time.advanceBlock();
          }

          for (let i = 0; i < 3; i += 1) {
            const account1Balance = await balanceStore.balanceAt(
              testAccount1,
              checkPoints[i],
            );
            expect(account1Balance).to.eq.BN(testAccount1Balances[i]);

            const account2Balance = await balanceStore.balanceAt(
              testAccount2,
              checkPoints[i],
            );
            expect(account2Balance).to.eq.BN(testAccount2Balances[i]);
          }
        },
      );
    });
  });
});
