const chai = require('chai');

const { BN, toBN } = web3.utils;
const bnChai = require('bn-chai');

const CurrencyGovernance = artifacts.require('CurrencyGovernance');

const { expect } = chai;
const { expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');
const util = require('../../tools/test/util');

let one;

chai.use(bnChai(BN));

contract('ECO [@group=1]', (accounts) => {
  one = toBN(10).pow(toBN(18));

  let eco;
  let faucet;
  let policy;
  let timedPolicies;
  let proposedInflationMult;
  let inflationBlockNumber;

  let counter = 0;

  beforeEach(async () => {
    const bob = accounts[2];
    const digits1to9 = Math.floor(Math.random() * 900000000) + 100000000;
    const digits10to19 = Math.floor(Math.random() * 10000000000);
    proposedInflationMult = `${digits10to19}${digits1to9}`;
    // console.log(digits10to19, digits1to9, proposedInflationMult);

    ({
      eco,
      faucet,
      policy,
      timedPolicies,
    } = await util.deployPolicy(accounts[counter], { trustednodes: [bob] }));

    // enact a random amount of linear inflation for all tests
    const borda = await CurrencyGovernance.at(
      await util.policyFor(policy, web3.utils.soliditySha3('CurrencyGovernance')),
    );

    await borda.propose(0, 0, 0, 0, new BN(proposedInflationMult), { from: bob });
    await time.increase(3600 * 24 * 10.1);

    const bobvote = [web3.utils.randomHex(32), bob, [bob]];
    const bobvotehash = web3.utils.soliditySha3(
      { type: 'bytes32', value: bobvote[0] },
      { type: 'address', value: bobvote[1] },
      { type: 'address', value: bobvote[2] },
    );
    await borda.commit(bobvotehash, { from: bob });
    await time.increase(3600 * 24 * 3);
    await borda.reveal(bobvote[0], bobvote[2], { from: bob });
    await time.increase(3600 * 24 * 1);
    await borda.updateStage();
    await borda.compute();
    await time.increase(3600 * 24 * 1);
    await timedPolicies.incrementGeneration();
    await time.advanceBlock();
    inflationBlockNumber = await time.latestBlock();
    await time.advanceBlock();
    await time.advanceBlock();

    // console.log((await eco.getPastLinearInflation(inflationBlockNumber)).toString())

    counter += 1;
  });

  describe('total supply', () => {
    const amount = one.muln(100);

    beforeEach(async () => {
      await faucet.mint(accounts[1], amount);
    });

    it('returns the total amount of tokens', async () => {
      const supply = await eco.totalSupply();

      expect(supply).to.eq.BN(amount);
    });
  });

  describe('balanceOf', () => {
    const amount = one.muln(100);

    beforeEach(async () => {
      await faucet.mint(accounts[1], amount);
    });

    context('when the requrested account has no tokens', () => {
      it('returns 0', async () => {
        const balance = await eco.balanceOf(accounts[2]);

        expect(balance).to.eq.BN(0);
      });
    });

    context('when there are tokens in the account', () => {
      it('returns the correct balance', async () => {
        const balance = await eco.balanceOf(accounts[1]);

        expect(balance).to.eq.BN(amount);
      });
    });
  });

  describe('transfer', () => {
    const amount = one.muln(1000);

    beforeEach(async () => {
      await faucet.mint(accounts[1], amount);
    });

    context('when the sender doesn\'t have enough balance', () => {
      const meta = { from: accounts[2] };
      it('reverts', async () => {
        await expectRevert(
          eco.transfer(accounts[3], amount, meta),
          'ERC20: transfer amount exceeds balance',
          eco.constructor,
        );
      });
    });

    context('when the sender has enough balance', () => {
      const meta = { from: accounts[1] };

      it('reduces the sender\'s balance', async () => {
        const startBalance = await eco.balanceOf(accounts[1]);
        await eco.transfer(accounts[2], amount, meta);
        const endBalance = await eco.balanceOf(accounts[1]);

        expect(endBalance.add(amount)).to.eq.BN(startBalance);
      });

      it('increases the balance of the recipient', async () => {
        const startBalance = await eco.balanceOf(accounts[2]);
        await eco.transfer(accounts[2], amount, meta);
        const endBalance = await eco.balanceOf(accounts[2]);

        expect(endBalance.sub(amount)).to.eq.BN(startBalance);
      });

      it('emits a Transfer event', async () => {
        const result = await eco.transfer(accounts[2], amount, meta);
        await expectEvent.inTransaction(
          result.tx,
          eco.constructor,
          'Transfer',
        );
      });

      it('returns true', async () => {
        const result = await eco.transfer.call(accounts[2], amount, meta);
        expect(result).to.be.true;
      });

      it('prevents a transfer to the 0 address', async () => {
        await expectRevert(
          eco.transfer('0x0000000000000000000000000000000000000000', amount, meta),
          'ERC20: transfer to the zero address',
          eco.constructor,
        );
      });
    });
  });

  describe('burn', () => {
    const amount = one.muln(1000);

    beforeEach(async () => {
      await faucet.mint(accounts[1], amount);
    });

    context('when the sender doesn\'t have enough balance', () => {
      const meta = { from: accounts[2] };
      it('reverts', async () => {
        await expectRevert(
          eco.burn(accounts[2], amount, meta),
          'ERC20: burn amount exceeds balance',
          eco.constructor,
        );
      });
    });

    context('when the sender is not the burning address', () => {
      const meta = { from: accounts[2] };
      it('reverts', async () => {
        await expectRevert(
          eco.burn(accounts[1], amount, meta),
          'Caller not authorized to burn tokens',
          eco.constructor,
        );
      });
    });

    context('when the sender has enough balance', () => {
      const meta = { from: accounts[1] };

      it('reduces the sender\'s balance', async () => {
        const startBalance = await eco.balanceOf(accounts[1]);
        await eco.burn(accounts[1], amount, meta);
        const endBalance = await eco.balanceOf(accounts[1]);

        expect(endBalance.add(amount)).to.eq.BN(startBalance);
      });

      it('reduces totalsupply', async () => {
        const startSupply = await eco.totalSupply();
        await eco.burn(accounts[1], amount, meta);
        const endSupply = await eco.totalSupply();

        expect(startSupply.sub(amount)).to.eq.BN(endSupply);
      });

      it('emits a Transfer event', async () => {
        const result = await eco.burn(accounts[1], amount, meta);
        await expectEvent.inTransaction(
          result.tx,
          eco.constructor,
          'Transfer',
        );
      });
    });
  });

  describe('approve/allowance', () => {
    const spender = accounts[2];

    context('when the source address has enough balance', () => {
      const from = accounts[1];
      const meta = { from };
      const amount = one.muln(1000);

      it('emits an Approval event', async () => {
        const result = await eco.approve(spender, amount, meta);
        await expectEvent.inTransaction(
          result.tx,
          eco.constructor,
          'Approval',
        );
      });

      it('prevents an approve for the 0 address', async () => {
        await expectRevert(
          eco.approve('0x0000000000000000000000000000000000000000', amount, meta),
          'ERC20: approve to the zero address',
          eco.constructor,
        );
      });

      context('when there is no existing allowance', () => {
        it('sets the allowance', async () => {
          await eco.approve(spender, amount, meta);
          const allowance = await eco.allowance(from, spender);
          expect(allowance).to.eq.BN(amount);
        });
      });

      context('when there is a pre-existing allowance', () => {
        beforeEach(async () => {
          await eco.approve(spender, amount.sub(new BN(50)), meta);
        });

        it('replaces the existing allowance', async () => {
          await eco.approve(spender, amount, meta);
          const allowance = await eco.allowance(from, spender);

          expect(allowance).to.eq.BN(amount);
        });

        it('emits the Approval event', async () => {
          const result = await eco.approve(spender, amount, meta);
          await expectEvent.inTransaction(
            result.tx,
            eco.constructor,
            'Approval',
          );
        });
      });
    });

    context('when the source address does not have enough balance', () => {
      const [, from] = accounts;
      const meta = { from };
      const amount = one.muln(1000);

      it('emits an Approval event', async () => {
        const result = await eco.approve(spender, amount, meta);
        await expectEvent.inTransaction(
          result.tx,
          eco.constructor,
          'Approval',
        );
      });

      context('when there is no existing allowance', () => {
        it('sets the allowance', async () => {
          await eco.approve(spender, amount, meta);
          const allowance = await eco.allowance(from, spender);

          expect(allowance).to.eq.BN(amount);
        });
      });

      context('when there is a pre-existing allowance', () => {
        beforeEach(async () => {
          await eco.approve(spender, amount.sub(new BN(50)), meta);
        });

        it('replaces the existing allowance', async () => {
          await eco.approve(spender, amount, meta);
          const allowance = await eco.allowance(from, spender);

          expect(allowance).to.eq.BN(amount);
        });

        it('emits the Approval event', async () => {
          const result = await eco.approve(spender, amount, meta);
          await expectEvent.inTransaction(result.tx, eco.constructor, 'Approval');
        });
      });
    });
  });

  describe('transferFrom', () => {
    const [, from, to, authorized, unauthorized] = accounts;
    const balance = one.muln(1000);
    const allowance = one.muln(100);
    const allowanceParts = [
      one.muln(10), one.muln(50), one.muln(40),
    ];

    beforeEach(async () => {
      await faucet.mint(from, balance);
      await eco.approve(authorized, allowance, { from });
    });

    context('with an unauthorized account', () => {
      const meta = { from: unauthorized };

      context('within the allowance', () => {
        it('reverts', async () => {
          await expectRevert(
            eco.transferFrom(from, to, allowanceParts[0], meta),
            'ERC20: transfer amount exceeds allowance.',
          );
        });
      });

      context('above the allowance', () => {
        it('reverts', async () => {
          await expectRevert(
            eco.transferFrom(from, to, allowance.add(one.muln(10)), meta),
            'ERC20: transfer amount exceeds allowance.',
          );
        });
      });
    });

    context('with an authorized account', () => {
      const meta = { from: authorized };

      context('within the allowance', () => {
        it('emits a Transfer event', async () => {
          const result = await eco.transferFrom(from, to, allowanceParts[0], meta);
          await expectEvent.inTransaction(
            result.tx,
            eco.constructor,
            'Transfer',
          );
        });

        it('adds to the recipient balance', async () => {
          const amount = allowanceParts[1];

          const startBalance = await eco.balanceOf(to);
          await eco.transferFrom(from, to, amount, meta);
          const endBalance = await eco.balanceOf(to);

          expect(endBalance.sub(startBalance)).to.eq.BN(amount);
        });

        it('subtracts from the source balance', async () => {
          const amount = allowanceParts[1];

          const startBalance = await eco.balanceOf(from);
          await eco.transferFrom(from, to, amount, meta);
          const endBalance = await eco.balanceOf(from);

          expect(startBalance.sub(endBalance)).to.eq.BN(amount);
        });

        it('decreases the allowance', async () => {
          const amount = allowanceParts[1];

          const startAllowance = await eco.allowance(from, authorized);
          await eco.transferFrom(from, to, amount, meta);
          const endAllowance = await eco.allowance(from, authorized);

          expect(startAllowance.sub(endAllowance)).to.eq.BN(amount);
        });

        it('allows multiple transfers', async () => {
          const startBalance = await eco.balanceOf(from);

          await Promise.all(
            allowanceParts.map(
              (part) => eco.transferFrom(from, to, part, meta),
            ),
          );

          const endBalance = await eco.balanceOf(from);

          expect(startBalance.sub(endBalance)).to.eq.BN(allowance);
        });

        context('with multiple transfers', () => {
          it('emits multiple Transfer events', async () => {
            await Promise.all(
              allowanceParts.map(
                async (part) => {
                  const result = await eco.transferFrom(from, to, part, meta);
                  await expectEvent.inTransaction(
                    result.tx,
                    eco.constructor,
                    'Transfer',
                  );
                },
              ),
            );
          });
        });
      });

      context('above the allowance', () => {
        context('with a single transfer', () => {
          it('reverts', async () => {
            await expectRevert(
              eco.transferFrom(from, to, allowance.add(new BN(1)), meta),
              'ERC20: transfer amount exceeds allowance.',
            );
          });
        });

        context('with multiple transfers', () => {
          it('can\'t exceed the allowance', async () => {
            const extra = new BN(1);

            await Promise.all(
              allowanceParts.map(
                (part) => eco.transferFrom(from, to, part, meta),
              ),
            );

            await expectRevert(
              eco.transferFrom(from, to, extra, meta),
              'ERC20: transfer amount exceeds allowance.',
            );
          });
        });
      });

      context('when transferring 0', () => {
        it('emits a Transfer event', async () => {
          const result = await eco.transferFrom(from, to, 0, meta);
          await expectEvent.inTransaction(result.tx, eco.constructor, 'Transfer');
        });

        it('does not decrease the allowance', async () => {
          const startAllowance = await eco.allowance(from, authorized);
          await eco.transferFrom(from, to, 0, meta);
          const endAllowance = await eco.allowance(from, authorized);

          expect(endAllowance).to.eq.BN(startAllowance);
        });

        it('does not change the sender balance', async () => {
          const startBalance = await eco.balanceOf(from);
          await eco.transferFrom(from, to, 0, meta);
          const endBalance = await eco.balanceOf(from);

          expect(endBalance).to.eq.BN(startBalance);
        });

        it('does not change the recipient balance', async () => {
          const startBalance = await eco.balanceOf(to);
          await eco.transferFrom(from, to, 0, meta);
          const endBalance = await eco.balanceOf(to);

          expect(endBalance).to.eq.BN(startBalance);
        });
      });
    });
  });

  describe('Events from BalanceStore', () => {
    const amount = one.muln(1000);

    it('emits Transfer when minting', async () => {
      const tx = await faucet.mint(accounts[1], amount);
      await expectEvent.inTransaction(tx.tx, eco.constructor, 'Transfer', { from: '0x0000000000000000000000000000000000000000', to: accounts[1], value: amount.toString() });
    });

    it('emits Transfer when burning', async () => {
      await faucet.mint(accounts[1], amount);
      const burnAmount = one.muln(100);
      const tx = await eco.burn(accounts[1], burnAmount, { from: accounts[1] });
      await expectEvent.inTransaction(tx.tx, eco.constructor, 'Transfer', { to: '0x0000000000000000000000000000000000000000', from: accounts[1], value: burnAmount.toString() });
    });
  });

  describe('Metadata', () => {
    it('has the standard 18 decimals', async () => {
      const decimals = await eco.decimals();
      expect(decimals).to.be.eq.BN(18);
    });
  });

  describe('Checkpoint data', () => {
    const [, from] = accounts;
    const deposit = one.muln(1000);
    const balance = deposit.muln(2);

    beforeEach(async () => {
      await faucet.mint(from, deposit);
      await faucet.mint(from, deposit);
    });

    // fixes here
    it('can get a checkpoint value', async () => {
      const inflationMult = await eco.getPastLinearInflation(inflationBlockNumber);
      const checkpoint = await eco.checkpoints(from, 1);
      expect(checkpoint.value).to.be.eq.BN(inflationMult.mul(balance));
    });

    it('can get the number of checkpoints', async () => {
      const numCheckpoints = await eco.numCheckpoints(from);
      expect(numCheckpoints).to.be.eq.BN(2);
    });

    it('can get the internal votes for an account', async () => {
      const inflationMult = await eco.getPastLinearInflation(inflationBlockNumber);
      const votes = await eco.getVotes(from);
      expect(votes).to.be.eq.BN(inflationMult.mul(balance));
    });

    it('cannot get the internal votes for an account until the block requestsed has been mined', async () => {
      await expectRevert(
        eco.getPastVotes(from, await time.latestBlock(), { from }),
        'VoteCheckpoints: block not yet mined',
        eco.constructor,
      );
    });

    it('cannot get the past supply until the block requestsed has been mined', async () => {
      await expectRevert(
        eco.getPastTotalSupply(await time.latestBlock(), { from }),
        'VoteCheckpoints: block not yet mined',
        eco.constructor,
      );
    });
  });

  describe('increase and decrease allowance', () => {
    const [, from, authorized] = accounts;
    const balance = one.muln(1000);
    const allowanceAmount = one.muln(100);
    const increment = one.muln(10);

    beforeEach(async () => {
      await faucet.mint(from, balance);
      await eco.approve(authorized, allowanceAmount, { from });
    });

    context('we can increase the allowance', () => {
      it('increases the allowance', async () => {
        await eco.increaseAllowance(authorized, increment, { from });
        const allowance = await eco.allowance(from, authorized);
        expect(allowance).to.be.eq.BN(allowanceAmount.add(increment));
      });
    });

    context('we can decrease the allowance', () => {
      it('decreases the allowance', async () => {
        await eco.decreaseAllowance(authorized, increment, { from });
        const allowance = await eco.allowance(from, authorized);
        expect(allowance).to.be.eq.BN(allowanceAmount.sub(increment));
      });

      it('cant decreases the allowance into negative values', async () => {
        await expectRevert(
          eco.decreaseAllowance(authorized, allowanceAmount.add(new BN(1)), { from }),
          'ERC20: decreased allowance below zero',
          eco.constructor,
        );
      });
    });
  });
});
