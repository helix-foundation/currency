/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */

const CurrencyGovernance = artifacts.require('CurrencyGovernance');
const Lockup = artifacts.require('Lockup');

const {
  BN,
} = web3.utils;
const {
  expectRevert,
  time,
} = require('@openzeppelin/test-helpers');

const chai = require('chai');
const bnChai = require('bn-chai');
const util = require('../../tools/test/util.js');

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

    await borda.propose(10, 20, 30, 40, { from: bob });
    await time.increase(3600 * 24 * 10.1);

    const bobvote = [web3.utils.randomHex(32), bob, [bob]];
    await borda.commit(hash(bobvote), { from: bob });
    await time.increase(3600 * 24 * 3);
    await borda.reveal(bobvote[0], bobvote[2], { from: bob });
    await time.increase(3600 * 24 * 1);
    await borda.updateStage();
    await borda.compute();
    await time.increase(3600 * 24 * 3);
    await timedPolicies.incrementGeneration();

    const [evt] = await currencyTimer.getPastEvents('LockupOffered');
    lockup = await Lockup.at(evt.args.addr);

    await faucet.faucet({ value: 1000000000, from: charlie });
    await token.approve(lockup.address, 1000000000, { from: charlie });
  });

  it('allows deposits', async () => {
    await lockup.deposit(1000000000, { from: charlie });
  });

  it('Rejects destruction', async () => {
    await expectRevert(lockup.destruct(), 'Cannot destroy while still open for selling');
  });

  describe('With a valid deposit', async () => {
    beforeEach(async () => {
      await lockup.deposit(1000000000, { from: charlie });
    });

    it('punishes early withdrawal', async () => {
      await lockup.withdraw({ from: charlie });
      expect(await token.balanceOf(charlie)).to.eq.BN(999999960);
    });

    it('doesnt allow indirect early withdrawal', async () => {
      await expectRevert(lockup.withdrawFor(charlie), 'Only depositor may withdraw early');
    });

    describe('A week later', async () => {
      beforeEach(async () => {
        await time.increase(3600 * 24 * 14.1);
        await timedPolicies.incrementGeneration();
      });

      it('rewards late withdrawal', async () => {
        await lockup.withdraw({ from: charlie });
        expect(await token.balanceOf(charlie)).to.eq.BN(1000000040);
      });

      it('allows indirect withdrawal', async () => {
        await lockup.withdrawFor(charlie);
        expect(await token.balanceOf(charlie)).to.eq.BN(1000000040);
      });

      it('Rejects destruction', async () => {
        await expectRevert(lockup.destruct(), 'All deposits must be withdrawn');
      });

      it('allows destruction after last withdrawal', async () => {
        await lockup.withdrawFor(charlie);
        await lockup.destruct();
      });
    });
  });
});
