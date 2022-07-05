/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */
const { expect } = require('chai');

const { ethers } = require('hardhat');
const { BigNumber } = require('ethers');
const { ecoFixture } = require('../utils/fixtures');

const time = require('../utils/time');
const util = require('../../tools/test/util');

describe('Lockup [@group=3]', () => {
  let alice;
  let bob;
  let charlie;
  let policy;
  let eco;
  let timedPolicies;
  let currencyTimer;
  let borda;
  let faucet;
  let lockup;

  beforeEach(async () => {
    const accounts = await ethers.getSigners();
    [alice, bob, charlie] = accounts;
    const trustednodes = [
      await alice.getAddress(),
      await bob.getAddress(),
      await charlie.getAddress(),
    ];

    ({
      policy, eco, faucet, timedPolicies, currencyTimer,
    } = await ecoFixture(trustednodes));

    const hash = (x) => web3.utils.soliditySha3(
      { type: 'bytes32', value: x[0] },
      { type: 'address', value: x[1] },
      { type: 'address', value: x[2] },
    );

    borda = await ethers.getContractAt(
      'CurrencyGovernance',
      await util.policyFor(policy, web3.utils.soliditySha3('CurrencyGovernance')),
    );

    await borda.connect(bob).propose(10, 20, 30, 40, BigNumber.from('1000000000000000000'));
    await time.increase(3600 * 24 * 10.1);

    const alicevote = [
      web3.utils.randomHex(32),
      await alice.getAddress(),
      [await bob.getAddress()],
    ];
    await borda.connect(alice).commit(hash(alicevote));
    const bobvote = [web3.utils.randomHex(32), await bob.getAddress(), [await bob.getAddress()]];
    await borda.connect(bob).commit(hash(bobvote));
    await time.increase(3600 * 24 * 3);
    await borda.connect(alice).reveal(alicevote[0], alicevote[2]);
    await borda.connect(bob).reveal(bobvote[0], bobvote[2]);
    await time.increase(3600 * 24 * 1);
    await borda.updateStage();
    await borda.compute();
    await time.increase(3600 * 24 * 3);
    await timedPolicies.incrementGeneration();

    const [evt] = await currencyTimer.queryFilter('NewLockup');
    lockup = await ethers.getContractAt('Lockup', evt.args.addr);

    await faucet.connect(charlie).mint(await charlie.getAddress(), 1000000000);
    await eco.connect(charlie).approve(lockup.address, 1000000000);
  });

  it('allows deposits', async () => {
    await lockup.connect(charlie).deposit(1000000000);
  });

  describe('Without a valid deposit', async () => {
    it('reverts on withdraw', async () => {
      await expect(lockup.connect(alice).withdraw()).to.be.revertedWith(
        'Withdrawals can only be made for accounts that made deposits',
      );
    });
  });

  describe('With a valid deposit', async () => {
    beforeEach(async () => {
      await lockup.connect(charlie).deposit(1000000000);
    });

    it('punishes early withdrawal', async () => {
      await lockup.connect(charlie).withdraw();
      expect(await eco.balanceOf(await charlie.getAddress())).to.equal(999999960);
    });

    it('does not allow early withdrawFor', async () => {
      await expect(
        lockup.connect(alice).withdrawFor(await charlie.getAddress()),
      ).to.be.revertedWith('Only depositor may withdraw early');
    });

    describe('j week later', async () => {
      beforeEach(async () => {
        await time.increase(3600 * 24 * 14.1);
        await timedPolicies.incrementGeneration();
      });

      it('can no longer deposit', async () => {
        await expect(lockup.connect(charlie).deposit(1000000000)).to.be.revertedWith(
          'Deposits can only be made during sale window',
        );
      });

      it('rewards late withdrawal', async () => {
        await lockup.connect(charlie).withdraw();
        expect(await eco.balanceOf(await charlie.getAddress())).to.equal(1000000040);
      });

      it('allows and rewards late withdrawFor', async () => {
        await lockup.connect(alice).withdrawFor(await charlie.getAddress());
        expect(await eco.balanceOf(await charlie.getAddress())).to.equal(1000000040);
      });

      it('withdrawal event emitted', async () => {
        await expect(lockup.connect(charlie).withdraw())
          .to.emit(lockup, 'Withdrawal')
          .withArgs(await charlie.getAddress(), '1000000040');
      });
    });
  });
});
