/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */

const Inflation = artifacts.require('Inflation');
const CurrencyGovernance = artifacts.require('CurrencyGovernance');
const Lockup = artifacts.require('Lockup');

const {
  BN,
  toBN,
} = web3.utils;
const {
  time,
  expectRevert,
} = require('@openzeppelin/test-helpers');

const chai = require('chai');
const bnChai = require('bn-chai');
const util = require('../../tools/test/util');

const { expect } = chai;

chai.use(bnChai(BN));

contract('CurrencyTimer [@group=6]', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];
  let counter = 0;
  let policy;
  let eco;
  let timedPolicies;
  let currencyTimer;
  let borda;
  let faucet;

  beforeEach(async () => {
    ({
      policy,
      eco,
      timedPolicies,
      currencyTimer,
      faucet,
    } = await util.deployPolicy(accounts[counter], { trustednodes: [alice, bob, charlie] }));
    counter += 1;

    borda = await CurrencyGovernance.at(
      await util.policyFor(policy, web3.utils.soliditySha3('CurrencyGovernance')),
    );
  });

  describe('reverts', () => {
    it('cannot be called early', async () => {
      await expectRevert(
        currencyTimer.notifyGenerationIncrease(),
        'Generation has not increased',
      );
    });

    it('cannot call lockupWithdrawal', async () => {
      await expectRevert(
        currencyTimer.lockupWithdrawal(alice, 10000, false, { from: alice }),
        'Not authorized to call this function',
      );
    });
  });

  describe('With a valid vote', () => {
    const hash = (x) => web3.utils.soliditySha3(
      { type: 'bytes32', value: x[0] },
      { type: 'address', value: x[1] },
      { type: 'address', value: x[2] },
    );

    const proposedInflationMult = toBN('1100000000000000000');
    const aliceBal = toBN(1000000000);

    beforeEach(async () => {
      await faucet.mint(alice, aliceBal);

      await borda.propose(10, 20, 30, 40, proposedInflationMult, { from: bob });
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
    });

    it('changed borda', async () => {
      expect(
        await util.policyFor(policy, web3.utils.soliditySha3('CurrencyGovernance')),
      ).to.not.eq.BN(borda.address);
    });

    it('Emitted NewCurrencyGovernance event correctly', async () => {
      const [evt] = await currencyTimer.getPastEvents('NewCurrencyGovernance');
      const gov = evt.args.addr;
      expect(
        await util.policyFor(policy, web3.utils.soliditySha3('CurrencyGovernance')),
      ).to.eq.BN(gov);
    });

    it('has inflation', async () => {
      const [evt] = await currencyTimer.getPastEvents('InflationStarted');
      const infl = await Inflation.at(evt.args.addr);
      expect(await infl.reward()).to.eq.BN(20);
      expect(await infl.numRecipients()).to.eq.BN(10);
      expect(await eco.balanceOf(infl.address)).to.eq.BN(200);
    });

    it('has lockup', async () => {
      const [evt] = await currencyTimer.getPastEvents('LockupOffered');
      const lockup = await Lockup.at(evt.args.addr);
      expect(await eco.balanceOf(lockup.address)).to.eq.BN(0);

      await faucet.mint(charlie, 1000000000, { from: charlie });
      await eco.approve(lockup.address, 1000000000, { from: charlie });
      await lockup.deposit(1000000000, { from: charlie });
      expect(await eco.balanceOf(lockup.address)).to.eq.BN(1000000000);

      expect(await currencyTimer.isLockup(lockup.address)).to.be.true;
    });

    it('has new inflation', async () => {
      const [evt] = await eco.getPastEvents('NewInflationMultiplier');
      expect(evt.args.inflationMultiplier).to.eq.BN(proposedInflationMult);
      const newAliceBal = await eco.balanceOf(alice);
      const inflationDigits = await eco.INITIAL_INFLATION_MULTIPLIER();
      expect(newAliceBal).to.eq.BN((aliceBal * inflationDigits) / proposedInflationMult);
    });
  });
});
