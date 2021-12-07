const chai = require('chai');

const { BN } = web3.utils;
const bnChai = require('bn-chai');

const { expect } = chai;
const PolicyInit = artifacts.require('PolicyInit');
const ForwardProxy = artifacts.require('ForwardProxy');
const Policy = artifacts.require('FakePolicy');
const EcoBalanceStore = artifacts.require('EcoBalanceStore');
const ERC20EcoToken = artifacts.require('ERC20EcoToken');
const MurderousPolicy = artifacts.require('MurderousPolicy');
const FakeInflation = artifacts.require('FakeInflation');
const InflationRootHashProposal = artifacts.require('InflationRootHashProposal');
const { constants, expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const UNKNOWN_POLICY_ID = web3.utils.soliditySha3('AttemptedMurder');

chai.use(bnChai(BN));

contract('ERC20EcoToken [@group=1]', ([owner, ...accounts]) => {
  let balanceStore;
  let token;
  let inflation;
  let murderer;
  let attemptedMurderer;

  beforeEach(async () => {
    const policyInit = await PolicyInit.new();
    const proxy = await ForwardProxy.new(policyInit.address);
    const rootHash = await InflationRootHashProposal.new(proxy.address);
    balanceStore = await EcoBalanceStore.new(proxy.address, rootHash.address, { from: owner });
    inflation = await FakeInflation.new();
    token = await ERC20EcoToken.new(proxy.address, { from: owner });

    murderer = await MurderousPolicy.new();
    attemptedMurderer = await MurderousPolicy.new();

    const tokenHash = web3.utils.soliditySha3('ERC20Token');
    const balanceStoreHash = web3.utils.soliditySha3('BalanceStore');

    await (await PolicyInit.at(proxy.address)).fusedInit(
      (await Policy.new()).address,
      [],
      [
        tokenHash,
        balanceStoreHash,
        await balanceStore.ID_CLEANUP(),
        UNKNOWN_POLICY_ID,
        await balanceStore.ID_CURRENCY_GOVERNANCE(),
      ],
      [
        token.address,
        balanceStore.address,
        murderer.address,
        attemptedMurderer.address,
        inflation.address,
      ],
      [tokenHash],
    );

    await balanceStore.reAuthorize();
  });

  it('reverts when called by any address other than the store ', async () => {
    await expectRevert(
      token.emitSentEvent(accounts[1], accounts[1], accounts[1], 200, web3.utils.soliditySha3('data1'), web3.utils.soliditySha3('data2')),
      'Only the balanceStore can call this',
    );
  });
  context('getters', () => {
    it('returns the name of the related balanceStore', async () => {
      const tokenName = await token.name();
      const balanceStoreName = await balanceStore.name();
      expect(tokenName).to.equal(balanceStoreName);
    });

    it('returns the symbol of the related balanceStore', async () => {
      // assert.equal(await token.symbol(), await balanceStore.symbol(), 'wrong symbol');
      const tokenSymbol = await token.symbol();
      const balanceStoreSymbol = await balanceStore.symbol();
      expect(tokenSymbol).to.equal(balanceStoreSymbol);
    });

    it('returns the decimals of the related balanceStore', async () => {
      const tokenDecimals = (await token.decimals()).toNumber();
      const storeDecimals = (await balanceStore.decimals()).toNumber();
      expect(tokenDecimals).to.equal(storeDecimals);
    });
  });

  describe('total supply', () => {
    beforeEach(async () => {
      await inflation.mint(balanceStore.address, accounts[1], new BN(100));
    });

    it('returns the total amount of tokens', async () => {
      const supply = await token.totalSupply();

      expect(supply).to.eq.BN(100);
    });
  });

  describe('balanceOf', () => {
    beforeEach(async () => {
      await inflation.mint(balanceStore.address, accounts[1], new BN(100));
    });

    context('when the requrested account has no tokens', () => {
      it('returns 0', async () => {
        const balance = await token.balanceOf(accounts[2]);

        expect(balance).to.eq.BN(0);
      });
    });

    context('when there are tokens in the account', () => {
      it('returns the correct balance', async () => {
        const balance = await token.balanceOf(accounts[1]);

        expect(balance).to.eq.BN(100);
      });
    });
  });

  describe('transfer', () => {
    const amount = new BN(100);

    beforeEach(async () => {
      await inflation.mint(balanceStore.address, accounts[1], amount);
    });

    context('when the sender doesn\'t have enough balance', () => {
      const meta = { from: accounts[2] };
      it('reverts', async () => {
        await expectRevert(
          token.transfer(accounts[3], amount, meta),
          'account has insufficient tokens',
          balanceStore.constructor,
        );
      });
    });

    context('when the sender has enough balance', () => {
      const meta = { from: accounts[1] };

      it('reduces the sender\'s balance', async () => {
        const startBalance = await token.balanceOf(accounts[1]);
        await token.transfer(accounts[2], amount, meta);
        const endBalance = await token.balanceOf(accounts[1]);

        expect(endBalance.add(amount)).to.eq.BN(startBalance);
      });

      it('increases the balance of the recipient', async () => {
        const startBalance = await token.balanceOf(accounts[2]);
        await token.transfer(accounts[2], amount, meta);
        const endBalance = await token.balanceOf(accounts[2]);

        expect(endBalance.sub(amount)).to.eq.BN(startBalance);
      });

      it('emits a Transfer event', async () => {
        const result = await token.transfer(accounts[2], amount, meta);
        await expectEvent.inTransaction(
          result.tx,
          token.constructor,
          'Transfer',
        );
      });

      it('returns true', async () => {
        const result = await token.transfer.call(accounts[2], amount, meta);
        expect(result).to.be.true;
      });
    });
  });

  describe('approve/allowance', () => {
    const spender = accounts[2];

    context('when the source address has enough balance', () => {
      const from = accounts[1];
      const meta = { from };
      const amount = new BN(100);

      it('emits an Approval event', async () => {
        const result = await token.approve(spender, amount, meta);
        await expectEvent.inTransaction(
          result.tx,
          token.constructor,
          'Approval',
        );
      });

      context('when there is no existing allowance', () => {
        it('sets the allowance', async () => {
          await token.approve(spender, amount, meta);
          const allowance = await token.allowance(from, spender);
          expect(allowance).to.eq.BN(amount);
        });
      });

      context('when there is a pre-existing allowance', () => {
        beforeEach(async () => {
          await token.approve(spender, amount.sub(new BN(50)), meta);
        });

        it('replaces the existing allowance', async () => {
          await token.approve(spender, amount, meta);
          const allowance = await token.allowance(from, spender);

          expect(allowance).to.eq.BN(amount);
        });

        it('emits the Approval event', async () => {
          const result = await token.approve(spender, amount, meta);
          await expectEvent.inTransaction(
            result.tx,
            token.constructor,
            'Approval',
          );
        });
      });
    });

    context('when the source address does not have enough balance', () => {
      const [, from] = accounts;
      const meta = { from };
      const amount = new BN(1000);

      it('emits an Approval event', async () => {
        const result = await token.approve(spender, amount, meta);
        await expectEvent.inTransaction(
          result.tx,
          token.constructor,
          'Approval',
        );
      });

      context('when there is no existing allowance', () => {
        it('sets the allowance', async () => {
          await token.approve(spender, amount, meta);
          const allowance = await token.allowance(from, spender);

          expect(allowance).to.eq.BN(amount);
        });
      });

      context('when there is a pre-existing allowance', () => {
        beforeEach(async () => {
          await token.approve(spender, amount.sub(new BN(50)), meta);
        });

        it('replaces the existing allowance', async () => {
          await token.approve(spender, amount, meta);
          const allowance = await token.allowance(from, spender);

          expect(allowance).to.eq.BN(amount);
        });

        it('emits the Approval event', async () => {
          const result = await token.approve(spender, amount, meta);
          await expectEvent.inTransaction(result.tx, token.constructor, 'Approval');
        });
      });
    });
  });

  describe('transferFrom', () => {
    const [, from, to, authorized, unauthorized] = accounts;
    const balance = new BN(1000);
    const allowance = new BN(100);
    const allowanceParts = [
      new BN(10), new BN(50), new BN(40),
    ];

    beforeEach(async () => {
      await inflation.mint(balanceStore.address, from, balance);
      await token.approve(authorized, allowance, { from });
    });

    context('with an unauthorized account', () => {
      const meta = { from: unauthorized };

      context('within the allowance', () => {
        it('reverts', async () => {
          await expectRevert(
            token.transferFrom(from, to, allowanceParts[0], meta),
            'Insufficient allowance for transfer',
          );
        });
      });

      context('above the allowance', () => {
        it('reverts', async () => {
          await expectRevert(
            token.transferFrom(from, to, allowance.add(new BN(10)), meta),
            'Insufficient allowance for transfer',
          );
        });
      });
    });

    context('with an authorized account', () => {
      const meta = { from: authorized };

      context('within the allowance', () => {
        it('emits a Transfer event', async () => {
          const result = await token.transferFrom(from, to, allowanceParts[0], meta);
          await expectEvent.inTransaction(
            result.tx,
            token.constructor,
            'Transfer',
          );
        });

        it('adds to the recipient balance', async () => {
          const amount = allowanceParts[1];

          const startBalance = await token.balanceOf(to);
          await token.transferFrom(from, to, amount, meta);
          const endBalance = await token.balanceOf(to);

          expect(endBalance.sub(startBalance)).to.eq.BN(amount);
        });

        it('subtracts from the source balance', async () => {
          const amount = allowanceParts[1];

          const startBalance = await token.balanceOf(from);
          await token.transferFrom(from, to, amount, meta);
          const endBalance = await token.balanceOf(from);

          expect(startBalance.sub(endBalance)).to.eq.BN(amount);
        });

        it('decreases the allowance', async () => {
          const amount = allowanceParts[1];

          const startAllowance = await token.allowance(from, authorized);
          await token.transferFrom(from, to, amount, meta);
          const endAllowance = await token.allowance(from, authorized);

          expect(startAllowance.sub(endAllowance)).to.eq.BN(amount);
        });

        it('allows multiple transfers', async () => {
          const startBalance = await token.balanceOf(from);

          await Promise.all(
            allowanceParts.map(
              (part) => token.transferFrom(from, to, part, meta),
            ),
          );

          const endBalance = await token.balanceOf(from);

          expect(startBalance.sub(endBalance)).to.eq.BN(allowance);
        });

        it('doesnt revert when transferring to 0 address', async () => {
          await token.transferFrom(from, constants.ZERO_ADDRESS, allowanceParts[0], meta);
        });

        context('with multiple transfers', () => {
          it('emits multiple Transfer events', async () => {
            await Promise.all(
              allowanceParts.map(
                async (part) => {
                  const result = await token.transferFrom(from, to, part, meta);
                  await expectEvent.inTransaction(
                    result.tx,
                    token.constructor,
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
              token.transferFrom(from, to, allowance.add(new BN(1)), meta),
              'Insufficient allowance for transfer',
            );
          });
        });

        context('with multiple transfers', () => {
          it('can\'t exceed the allowance', async () => {
            const extra = new BN(1);

            await Promise.all(
              allowanceParts.map(
                (part) => token.transferFrom(from, to, part, meta),
              ),
            );

            await expectRevert(
              token.transferFrom(from, to, extra, meta),
              'Insufficient allowance for transfer',
            );
          });
        });
      });

      context('when transferring 0', () => {
        it('emits a Transfer event', async () => {
          const result = await token.transferFrom(from, to, 0, meta);
          await expectEvent.inTransaction(result.tx, token.constructor, 'Transfer');
        });

        it('does not decrease the allowance', async () => {
          const startAllowance = await token.allowance(from, authorized);
          await token.transferFrom(from, to, 0, meta);
          const endAllowance = await token.allowance(from, authorized);

          expect(endAllowance).to.eq.BN(startAllowance);
        });

        it('does not change the sender balance', async () => {
          const startBalance = await token.balanceOf(from);
          await token.transferFrom(from, to, 0, meta);
          const endBalance = await token.balanceOf(from);

          expect(endBalance).to.eq.BN(startBalance);
        });

        it('does not change the recipient balance', async () => {
          const startBalance = await token.balanceOf(to);
          await token.transferFrom(from, to, 0, meta);
          const endBalance = await token.balanceOf(to);

          expect(endBalance).to.eq.BN(startBalance);
        });
      });
    });
  });

  describe('Destructible', () => {
    context('when instructed by an unauthorized user', () => {
      const [, other] = accounts;
      it('cannot be killed', async () => {
        await expectRevert(
          token.destruct({ from: other }),
          'Only the cleanup policy contract',
        );
      });
    });

    context('when instructed by an authorized policy', () => {
      it('can be killed', async () => {
        await murderer.destruct(token.address);
      });
    });

    context('when instructed by an unauthorized policy', () => {
      it('cannot be killed', async () => {
        await expectRevert(
          attemptedMurderer.destruct(token.address),
          'Only the cleanup policy contract',
        );
      });
    });
  });

  describe('Events from BalanceStore', () => {
    it('emits Transfer when minting', async () => {
      const tx = await inflation.mint(balanceStore.address, accounts[1], new BN(100));
      await expectEvent.inTransaction(tx.tx, token.constructor, 'Transfer', { from: '0x0000000000000000000000000000000000000000', to: accounts[1], value: '100' });
    });

    it('emits Transfer when burning', async () => {
      await inflation.mint(balanceStore.address, accounts[1], new BN(100));
      const tx = await token.transfer('0x0000000000000000000000000000000000000000', new BN(10), { from: accounts[1] });
      await expectEvent.inTransaction(tx.tx, token.constructor, 'Transfer', { to: '0x0000000000000000000000000000000000000000', from: accounts[1], value: '10' });
    });
  });
});
