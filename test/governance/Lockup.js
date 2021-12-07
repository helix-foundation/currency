/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */

const CurrencyGovernance = artifacts.require('CurrencyGovernance');
const Lockup = artifacts.require('Lockup');

const {
  BN,
  toBN,
} = web3.utils;
const {
  expectRevert,
  expectEvent,
  time,
} = require('@openzeppelin/test-helpers');

const chai = require('chai');
const bnChai = require('bn-chai');
const util = require('../../tools/test/util');

const { expect } = chai;

chai.use(bnChai(BN));

contract('Lockup [@group=3]', ([alice, bob, charlie]) => {
  let policy;
  let token;
  let timedPolicies;
  let currencyTimer;
  let borda;
  let faucet;
  let lockup;

  beforeEach(async () => {
    const hash = (x) => web3.utils.soliditySha3(
      { type: 'bytes32', value: x[0] },
      { type: 'address', value: x[1] },
      { type: 'address', value: x[2] },
    );
    ({
      policy,
      token,
      timedPolicies,
      currencyTimer,
      faucet,
    } = await util.deployPolicy({ trustees: [alice, bob, charlie] }));

    borda = await CurrencyGovernance.at(
      await util.policyFor(policy, await timedPolicies.ID_CURRENCY_GOVERNANCE()),
    );

    await borda.propose(10, 20, 30, 40, toBN('1000000000000000000'), { from: bob });
    await time.increase(3600 * 24 * 10.1);

    const alicevote = [web3.utils.randomHex(32), alice, [bob]];
    await borda.commit(hash(alicevote), { from: alice });
    const bobvote = [web3.utils.randomHex(32), bob, [bob]];
    await borda.commit(hash(bobvote), { from: bob });
    await time.increase(3600 * 24 * 3);
    await borda.reveal(alicevote[0], alicevote[2], { from: alice });
    await borda.reveal(bobvote[0], bobvote[2], { from: bob });
    await time.increase(3600 * 24 * 1);
    await borda.updateStage();
    await borda.compute();
    await time.increase(3600 * 24 * 3);
    await timedPolicies.incrementGeneration();

    const [evt] = await currencyTimer.getPastEvents('LockupOffered');
    lockup = await Lockup.at(evt.args.addr);

    await faucet.mint(charlie, 1000000000, { from: charlie });
    await token.approve(lockup.address, 1000000000, { from: charlie });
  });

  it('allows deposits', async () => {
    await lockup.deposit(1000000000, { from: charlie });
  });

  describe('With a valid deposit', async () => {
    beforeEach(async () => {
      await lockup.deposit(1000000000, { from: charlie });
    });

    it('punishes early withdrawal', async () => {
      await lockup.withdraw({ from: charlie });
      expect(await token.balanceOf(charlie)).to.eq.BN(999999960);
    });

    describe('A week later', async () => {
      beforeEach(async () => {
        await time.increase(3600 * 24 * 14.1);
        await timedPolicies.incrementGeneration();
      });

      it('can no longer deposit', async () => {
        await expectRevert(
          lockup.deposit(1000000000, { from: charlie }),
          'Deposits can only be made during sale window',
        );
      });

      it('rewards late withdrawal', async () => {
        await lockup.withdraw({ from: charlie });
        expect(await token.balanceOf(charlie)).to.eq.BN(1000000040);
      });

      it('withdrawal event emitted', async () => {
        const result = await lockup.withdraw({ from: charlie });

        await expectEvent.inTransaction(
          result.tx,
          lockup.constructor,
          'Withdrawal',
          { to: charlie, amount: '1000000040' },
        );
      });
    });
  });
});
