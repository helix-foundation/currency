const chai = require('chai');

const {
  BN,
} = web3.utils;
const bnChai = require('bn-chai');

const {
  expect,
} = chai;

const ForwardProxy = artifacts.require('ForwardProxy');
const EcoBalanceStore = artifacts.require('EcoBalanceStore');
const Token = artifacts.require('Token');
const CurrencyGovernance = artifacts.require('CurrencyGovernance');

const MAX_ACCOUNT_BALANCE = new BN(
  '115792089237316195423570985008687907853269984665640564039457', // 584007913129639935', removed as we use 18 digits to store inflation
);
const {
  expectEvent,
  expectRevert,
  time,
} = require('@openzeppelin/test-helpers');

const util = require('../../tools/test/util.js');

chai.use(bnChai(BN));

contract('EcoBalanceStore [@group=3]', (unsortedAccounts) => {
  let balanceStore;
  let policy;
  let token;
  let borda;
  let currencyTimer;
  let faucet;
  const accounts = Array.from(unsortedAccounts);
  accounts.sort((a, b) => Number(a - b));
  let timedPolicies;
  const [creator] = accounts;

  beforeEach('global setup', async () => {
    ({
      policy,
      token,
      timedPolicies,
      balanceStore,
      currencyTimer,
      faucet,
      authedCleanup,
      unauthedCleanup,
    } = await util.deployPolicy());

    borda = await CurrencyGovernance.at(
      await util.policyFor(policy, await timedPolicies.ID_CURRENCY_GOVERNANCE()),
    );
  });

  describe('Initializable', () => {
    it('should not allow calling initialize on the base contract', async () => {
      await expectRevert(
        balanceStore.initialize(balanceStore.address),
        'Can only be called during initialization',
      );
    });

    context('when proxied', () => {
      let proxiedBalanceStore;

      beforeEach(async () => {
        proxiedBalanceStore = await EcoBalanceStore.at(
          (await ForwardProxy.new(balanceStore.address)).address,
        );
      });

      it('should not allow calling initialize on the proxy', async () => {
        await expectRevert(
          proxiedBalanceStore.initialize(balanceStore.address),
          'Can only be called during initialization',
        );
      });
    });
  });

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

      context('overflowing MAX_ACCOUNT_BALANCE', () => {
        const nearMaxUint256 = MAX_ACCOUNT_BALANCE.sub(new BN(500));

        beforeEach(async () => {
          await faucet.mint(
            accounts[1],
            nearMaxUint256,
          );
        });

        it('should throw when minting coins', async () => {
          await expectRevert.unspecified(
            faucet.mint(accounts[1], new BN(600)),
          );
        });

        it('should not increase the balance when minting coins', async () => {
          const startBalance = await balanceStore.balance(accounts[1]);
          await expectRevert.unspecified(
            faucet.mint(accounts[1], new BN(1000)),
          );
          const endBalance = await balanceStore.balance(accounts[1]);

          expect(endBalance).to.eq.BN(startBalance);
        });

        it(
          'should not increase the token supply when minting coins',
          async () => {
            const startSupply = await balanceStore.tokenSupply();
            await expectRevert.unspecified(
              faucet.mint(accounts[1], new BN(600)),
            );
            const endSupply = await balanceStore.tokenSupply();

            expect(endSupply).to.eq.BN(startSupply);
          },
        );
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

      it('should not increase the balance when minting coins', async () => {
        const startBalance = await balanceStore.balance(accounts[1]);
        await expectRevert.unspecified(balanceStore.mint(accounts[1], 1000, meta));
        const endBalance = await balanceStore.balance(accounts[1]);

        expect(endBalance).to.eq.BN(startBalance);
      });

      it('should not increase the supply when minting coins', async () => {
        const startSupply = await balanceStore.balance(accounts[1]);
        await expectRevert.unspecified(balanceStore.mint(accounts[1], 1000, meta));
        const endSupply = await balanceStore.balance(accounts[1]);

        expect(endSupply).to.eq.BN(startSupply);
      });
    });
  });

  describe('Authorizable', () => {
    let address;
    let tx;

    beforeEach('setup token authorization', async () => {
      ({
        address,
      } = (await Token.new(policy.address, balanceStore.address)));
      await policy.setLabel('Token', address);
    });

    context('when authorizing an address', () => {
      context('from the policy contract', () => {
        beforeEach('authorize a contract', async () => {
          tx = policy.authorize(balanceStore.address, 'Token');
        });

        it('emits the Authorized event', async () => {
          const result = await (await tx).tx;
          await expectEvent.inTransaction(
            result,
            balanceStore.constructor,
            'Authorized',
          );
        });

        it('authorizes the address', async () => {
          await tx;
          const isAuthorized = await balanceStore.isAuthorized(address);

          expect(isAuthorized).to.be.true;
        });

        it('rejects double-authorizations', async () => {
          await expectRevert(policy.authorize(balanceStore.address, 'Token'), 'Contract is already authorized');
        });
      });

      context('from an unauthorized user account', () => {
        const meta = {
          from: accounts[2],
        };

        it('reverts', async () => {
          await expectRevert(
            balanceStore.authorize('Token', meta),
            'Only the policy contract',
          );
        });

        it('does not authorize the address', async () => {
          await expectRevert.unspecified(balanceStore.authorize('Token', meta));

          expect(await balanceStore.isAuthorized(address)).to.be.false;
        });
      });
    });

    context('when revoking an address', () => {
      context('that is authorized', () => {
        beforeEach('wait for authorization', async () => {
          tx = policy.authorize(balanceStore.address, 'Token');
          await tx;
        });

        context('from the policy contract', () => {
          it('revokes the address', async () => {
            await policy.revoke(balanceStore.address, 'Token');

            expect(await balanceStore.isAuthorized(address)).to.be.false;
          });

          it('emits the Revoked event', async () => {
            const txdata = await policy.revoke(balanceStore.address, 'Token');
            const result = await txdata.tx;
            await expectEvent.inTransaction(result, balanceStore.constructor, 'Revoked');
          });
        });

        context('from an unauthorized user account', () => {
          const meta = {
            from: accounts[2],
          };

          it('reverts', async () => {
            await expectRevert(
              balanceStore.revoke('Token', meta),
              'Only the policy contract',
            );
          });

          it('does not revoke the address', async () => {
            await expectRevert.unspecified(balanceStore.revoke('Token', meta));

            expect(await balanceStore.isAuthorized(address)).to.be.true;
          });
        });
      });

      context('that is not authorized', () => {
        context('from an owner account', () => {
          it('rejects revoking', async () => {
            await expectRevert(policy.revoke(balanceStore.address, 'Token'), 'Contract is not authorized');
          });
        });

        context('from an unauthorized user account', () => {
          const meta = {
            from: accounts[2],
          };

          it('reverts', async () => {
            await expectRevert(
              balanceStore.revoke('Token', meta),
              'Only the policy contract',
            );
          });

          it('leaves the address in an unauthorized state', async () => {
            await expectRevert.unspecified(balanceStore.revoke('Token', meta));

            expect(await balanceStore.isAuthorized(address)).to.be.false;
          });
        });
      });
    });
  });

  describe('Transferrable (starting balance of 1000)', () => {
    let authorizedAddresses;
    let unauthorizedAddresses;

    beforeEach('setup starting balances for transfers', async () => {
      authorizedAddresses = await Promise.all([
        Token.new(policy.address, balanceStore.address),
        Token.new(policy.address, balanceStore.address),
      ]);
      unauthorizedAddresses = await Promise.all([
        Token.new(policy.address, balanceStore.address),
        Token.new(policy.address, balanceStore.address),
      ]);

      const meta = {
        from: creator,
      };
      let label = '';

      // eslint-disable-next-line no-restricted-syntax
      for (const account of authorizedAddresses) {
        /* eslint-disable no-await-in-loop */
        label += 'T';
        await policy.setLabel(label, account.address, meta);
        await policy.authorize(balanceStore.address, label);
        await faucet.mint(
          account.address,
          new BN(1000),
        );
        /* eslint-enable no-await-in-loop */
      }

      await Promise.all(
        unauthorizedAddresses.map(
          (account) => faucet.mint(
            account.address,
            new BN(1000),
          ),
        ),
      );
    });

    function itDoesNotChangeTheBalance(what, account, op) {
      it(`does not change the balance of ${what}`, async () => {
        const acc = (typeof account === 'function') ? await account() : account;
        const startBalance = await balanceStore.balance(acc);
        await op();
        const endBalance = await balanceStore.balance(acc);

        expect(endBalance).to.eq.BN(startBalance);
      });
    }

    context('when making a transfer', () => {
      let from;
      let to;

      beforeEach(async () => {
        from = unauthorizedAddresses[0].address;
        to = unauthorizedAddresses[1].address;
      });

      function assertionsWithTransferSizeOf(amount) {
        context('from an unauthorized address', () => {
          it('reverts', async () => {
            expectRevert(
              unauthorizedAddresses[0].transfer(from, to, amount),
              'Sender not authorized',
            );
          });

          it('does not change the token supply', async () => {
            const startSupply = await balanceStore.tokenSupply();
            await expectRevert.unspecified(
              unauthorizedAddresses[0].transfer(from, to, amount),
            );
            const endSupply = await balanceStore.tokenSupply();

            expect(endSupply).to.eq.BN(startSupply);
          });

          const doTransfer = () => expectRevert.unspecified(
            unauthorizedAddresses[0].transfer(from, to, amount),
          );
          itDoesNotChangeTheBalance('the source', () => from, doTransfer);
          itDoesNotChangeTheBalance('the destination', () => to, doTransfer);
        });

        context('from an authorized address', () => {
          it('does not change the token supply', async () => {
            const startSupply = await balanceStore.tokenSupply();
            await authorizedAddresses[0].transfer(from, to, amount);
            const endSupply = await balanceStore.tokenSupply();

            expect(endSupply).to.eq.BN(startSupply);
          });

          it('reduces the balance of the source account', async () => {
            const startBalance = await balanceStore.balance(from);
            await authorizedAddresses[0].transfer(from, to, amount);
            const endBalance = await balanceStore.balance(from);

            expect(endBalance.add(amount)).to.eq.BN(startBalance);
          });

          it('increases the balance of the destination account', async () => {
            const startBalance = await balanceStore.balance(to);
            await authorizedAddresses[0].transfer(from, to, amount);
            const endBalance = await balanceStore.balance(to);

            expect(endBalance.sub(amount)).to.eq.BN(startBalance);
          });
        });
      }

      context('of 100 units', () => {
        assertionsWithTransferSizeOf(new BN(100));
      });

      context('of 0 units', () => {
        assertionsWithTransferSizeOf(new BN(0));
      });

      context('of 2000 units from an authorized address', () => {
        const amount = new BN(2000);

        it('reverts', async () => {
          expectRevert(
            authorizedAddresses[0].transfer(from, to, amount),
            'account has insufficient tokens',
          );
        });

        it('does not change the token supply', async () => {
          const startSupply = await balanceStore.tokenSupply();
          await expectRevert.unspecified(authorizedAddresses[0].transfer(from, to, amount));
          const endSupply = await balanceStore.tokenSupply();

          expect(endSupply).to.eq.BN(startSupply);
        });

        const doTransfer = () => expectRevert.unspecified(
          authorizedAddresses[0].transfer(from, to, amount),
        );
        itDoesNotChangeTheBalance('the source', () => from, doTransfer);
        itDoesNotChangeTheBalance('the destination', () => to, doTransfer);
      });

      /* In theory we should also test to verify that we can't cause any
       * integer overflows in account balances. However, because the total
       * token supply is bounded above by MAX_ACCOUNT_BALANCE, and this is verified to
       * be enforced in the tests for Mintable, we know that there can never be
       * enough total tokens to cause an overflow. We can't even cause the
       * situation here in order to test it, unless we implement some sort of
       * escape hatch to allow violation of the Mintable constraints.
       */
    });
  });

  describe('Destructible', () => {
    context('when instructed by an unauthorized user', () => {
      const [, other] = accounts;
      it('cannot be killed', async () => {
        await expectRevert(
          balanceStore.destruct({
            from: other,
          }),
          'Only the cleanup policy contract',
        );
      });
    });

    context('when instructed by an authorized policy', () => {
      it('can be killed', async () => {
        await authedCleanup.destruct(balanceStore.address);
      });
    });

    context('when instructed by an unauthorized policy', () => {
      it('cannot be killed', async () => {
        await expectRevert(
          unauthedCleanup.destruct(balanceStore.address),
          'Only the cleanup policy contract',
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

    context('for a stale account', () => {
      const [, testAccount] = accounts;
      let originalGeneration;
      let initialBalance;

      beforeEach(async () => {
        await faucet.mint(testAccount, new BN(1000));
        originalGeneration = (await balanceStore.currentGeneration()).toNumber();
        initialBalance = await balanceStore.balanceAt(
          accounts[1],
          originalGeneration,
        );

        await time.increase(31557600 / 10, accounts[0]);
        await timedPolicies.incrementGeneration();
      });

      it('does not report as up-to-date', async () => {
        assert.equal(await balanceStore.isUpdated(testAccount), false);
      });

      it('reports a generation other than the original', async () => {
        expect(await balanceStore.currentGeneration())
          .to.not.eq.BN(originalGeneration);
      });

      it('uses the last-updated generation for old balances', async () => {
        expect(
          await balanceStore.balanceAt(
            testAccount,
            await balanceStore.currentGeneration(),
          ),
        ).to.be.eq.BN(initialBalance);
      });

      it('uses the last-updated generation as the balance', async () => {
        expect(await balanceStore.balance(testAccount))
          .to.be.eq.BN(initialBalance);
      });
    });

    it('Cannot return future balances', async () => {
      const generation = (await balanceStore.currentGeneration()).toNumber();
      await expectRevert(
        balanceStore.balanceAt(accounts[1], generation + 1),
        'No such generation exists',
      );
    });

    context('after a long time', () => {
      const [, testAccount] = accounts;
      let originalGeneration;
      let initialBalance;

      beforeEach('set things up and let some time pass', async () => {
        originalGeneration = await balanceStore.currentGeneration();
        await faucet.mint(testAccount, new BN(1000));
        initialBalance = await balanceStore.balanceAt(
          accounts[1],
          originalGeneration,
        );

        // 12 months pass...
        for (let i = 0; i <= 12; i += 1) {
          /* eslint-disable no-await-in-loop */
          await time.increase(31557600 / 10, accounts[0]);
          await timedPolicies.incrementGeneration();
          /* eslint-enable no-await-in-loop */
        }
      });

      it('does not automatically update', async () => {
        assert.equal(await balanceStore.isUpdated(testAccount), false);
      });

      it('preserves orignal balance', async () => {
        expect(await balanceStore.balanceAt(testAccount, originalGeneration))
          .to.eq.BN(initialBalance);
      });

      context('after even longer', () => {
        let intermediateGeneration;
        let intermediateBalance;

        beforeEach(async () => {
          await balanceStore.update(testAccount);

          intermediateGeneration = await balanceStore.currentGeneration();
          intermediateBalance = await balanceStore.balance(testAccount);

          // 12 months pass...
          for (let i = 0; i <= 12; i += 1) {
            /* eslint-disable no-await-in-loop */
            await time.increase(31557600 / 10, accounts[0]);
            await timedPolicies.incrementGeneration();
            /* eslint-enable no-await-in-loop */
          }
        });

        it('does not automatically update', async () => {
          assert.equal(await balanceStore.isUpdated(testAccount), false);
        });

        it('preserves orignal balance', async () => {
          expect(
            await balanceStore.balanceAt(
              testAccount,
              intermediateGeneration,
            ),
          ).to.eq.BN(intermediateBalance);
        });

        it('can update', async () => {
          await balanceStore.update(testAccount);
        });
      });

      context('when there is no old generation', async () => {
        it('can still update to the current generation', async () => {
          await balanceStore.update(accounts[3]);
        });
      });

      context('when updating', () => {
        beforeEach('update testAccount to the latest generation', async () => {
          await balanceStore.update(testAccount);
        });

        it('presents the account as up-to-date', async () => {
          assert(await balanceStore.isUpdated(testAccount));
        });

        it('clears the original generation from history', async () => {
          expect(await balanceStore.balanceAt(testAccount, originalGeneration))
            .to.be.zero;
        });
      });
    });

    context('after 3 generations', () => {
      const [, testAccount1, testAccount2] = accounts;
      let startGen;

      beforeEach('setup generation balances', async () => {
        startGen = (await balanceStore.currentGeneration()).toNumber();
        for (let i = 0; i < 3; i += 1) {
          /* eslint-disable no-await-in-loop */
          if (i === 0) {
            await faucet.mint(testAccount2, new BN(1000));
          }

          await faucet.mint(testAccount1, new BN(1000));
          await time.increase(31557600 / 10);
          await timedPolicies.incrementGeneration();
          await faucet.mint(testAccount1, new BN(10));

          if (i === 2) {
            await faucet.mint(testAccount2, new BN(1000));
          }
          /* eslint-enable no-await-in-loop */
        }
      });

      let generationBalances = [0, 2010, 3020, 3030];

      generationBalances.forEach((expectedBalance, generation) => {
        it(
          `first account has stake ${expectedBalance} at generation ${generation}`,
          async () => {
            const balance = await balanceStore.balanceAt(
              testAccount1,
              startGen + generation,
            );
            expect(balance).to.eq.BN(expectedBalance);
          },
        );
      });

      generationBalances = [0, 1000, 1000, 2000];
      generationBalances.forEach((expectedBalance, generation) => {
        it(
          `second account has stake ${expectedBalance} at generation ${generation}`,
          async () => {
            const balance = await balanceStore.balanceAt(
              testAccount2,
              startGen + generation,
            );
            expect(balance).to.eq.BN(expectedBalance);
          },
        );
      });
    });
  });
});
