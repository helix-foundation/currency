const PolicyProposals = artifacts.require('PolicyProposals');
const FlashLoaner = artifacts.require('FlashLoaner');

const chai = require('chai');
const bnChai = require('bn-chai');

const { expect } = chai;
const {
  time,
} = require('@openzeppelin/test-helpers');

const util = require('../../tools/test/util');

const { BN, toBN } = web3.utils;
chai.use(bnChai(BN));

contract('VotingPower [@group=2]', (accounts) => {
  let policy;
  let eco;
  let faucet;
  let timedPolicies;
  let proposals;
  let blockNumber;
  let ecox;
  let ecoXLockup;
  let one;
  let alicePower;

  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];
  let counter = 0;

  beforeEach(async () => {
    one = toBN(10).pow(toBN(18));
    ({
      policy,
      eco,
      faucet,
      timedPolicies,
      ecox,
      ecoXLockup,
    } = await util.deployPolicy(accounts[counter], { trustednodes: [bob] }));

    await faucet.mint(alice, one.muln(250));
    await faucet.mint(bob, one.muln(250));
    await faucet.mint(charlie, one.muln(500));

    await time.increase(3600 * 24 * 14 + 1);
    await timedPolicies.incrementGeneration();

    await ecox.transfer(alice, one.muln(400), { from: accounts[counter] });
    await ecox.transfer(bob, one.muln(400), { from: accounts[counter] });
    await ecox.transfer(charlie, one.muln(200), { from: accounts[counter] });

    // calculated from the above variables for when ECOx is exchanged
    alicePower = '741824697641270317824';

    await time.increase(3600 * 24 * 14 + 1);
    await timedPolicies.incrementGeneration();
    blockNumber = await time.latestBlock();
    await time.advanceBlock();

    proposals = await PolicyProposals.at(
      await util.policyFor(policy, web3.utils.soliditySha3('PolicyProposals')),
    );

    counter += 1;
  });

  context('with nothing locked up', () => {
    describe('only ECO power', () => {
      it('Has the correct total power', async () => {
        // 1000 total, no ECOx power
        expect(await proposals.totalVotingPower(blockNumber)).to.eq.BN(one.muln(1000));
      });

      it('Has the right power for alice', async () => {
        // 250, no ECOx power
        expect(await proposals.votingPower(alice, blockNumber)).to.eq.BN(one.muln(250));
      });
    });

    describe('only ECO power, bolstered by exchanged ECOx', () => {
      beforeEach(async () => {
        await ecox.exchange(one.muln(400), { from: alice });
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        blockNumber = await time.latestBlock();
        await time.advanceBlock();
      });

      it('Has the correct total power', async () => {
        // The original 750 plus all of alice's power as ECO
        expect(await proposals.totalVotingPower(blockNumber)).to.eq.BN(
          one.muln(750).add(toBN(alicePower)),
        );
      });

      it('Has the right power for alice', async () => {
        // correctly includes all the converted ECOx
        expect(await proposals.votingPower(alice, blockNumber)).to.eq.BN(toBN(alicePower));
      });
    });
  });

  context('voting checkpoint stress tests', () => {
    it('gets the right voting power despite multiple transfers', async () => {
      await eco.enableDelegation({ from: charlie });
      await eco.delegate(charlie, { from: bob });
      const blockNumber1 = await time.latestBlock();

      // don't go much above 60 on iterations
      const iterations1 = 50;
      const iterations2 = 6;
      const promises1 = [];

      // net zero transfer
      for (let i = 0; i < iterations1; i++) {
        promises1.push(eco.transfer(alice, one.muln(4), { from: bob }));
        promises1.push(eco.transfer(bob, one.muln(4), { from: alice }));
      }
      await Promise.all(promises1);

      const blockNumber2 = await time.latestBlock();
      const promises2 = [];

      // net zero transfer
      for (let i = 0; i < iterations2; i++) {
        promises2.push(eco.transfer(alice, one.muln(4), { from: bob }));
        promises2.push(eco.transfer(bob, one.muln(4), { from: alice }));
      }
      await Promise.all(promises2);

      // the only net transfer
      await eco.transfer(alice, one.muln(40), { from: bob });
      const blockNumber3 = await time.latestBlock();
      await time.advanceBlock();

      /* eslint-disable no-console */
      // gas tests for the older blocks
      console.log(await proposals.votingPower.estimateGas(alice, blockNumber1));
      console.log(await proposals.votingPower.estimateGas(alice, blockNumber2));
      console.log(await proposals.votingPower.estimateGas(alice, blockNumber3));
      /* eslint-enable no-console */

      // before everything
      expect(await proposals.votingPower(alice, blockNumber1)).to.eq.BN(one.muln(250));
      expect(await proposals.votingPower(bob, blockNumber1)).to.eq.BN(toBN(0));
      expect(await proposals.votingPower(charlie, blockNumber1)).to.eq.BN(one.muln(750));
      // in the middle
      expect(await proposals.votingPower(alice, blockNumber2)).to.eq.BN(one.muln(250));
      expect(await proposals.votingPower(bob, blockNumber2)).to.eq.BN(toBN(0));
      expect(await proposals.votingPower(charlie, blockNumber2)).to.eq.BN(one.muln(750));
      // after with a net transfer
      expect(await proposals.votingPower(alice, blockNumber3)).to.eq.BN(one.muln(290));
      expect(await proposals.votingPower(bob, blockNumber3)).to.eq.BN(toBN(0));
      expect(await proposals.votingPower(charlie, blockNumber3)).to.eq.BN(one.muln(710));
    });

    it('test of flashloan attacks', async () => {
      const flashLoaner = await FlashLoaner.new(eco.address);

      await eco.approve(flashLoaner.address, one.muln(200), { from: bob });
      await eco.approve(flashLoaner.address, one.muln(205), { from: alice });
      const blockNumber1 = await time.latestBlock();

      await flashLoaner.flashLoan(bob, alice, one.muln(200), one.muln(205));
      const blockNumber2 = await time.latestBlock();
      await time.advanceBlock();

      // before everything
      expect(await proposals.votingPower(alice, blockNumber1)).to.eq.BN(one.muln(250));
      expect(await proposals.votingPower(bob, blockNumber1)).to.eq.BN(one.muln(250));
      // in the middle
      expect(await proposals.votingPower(alice, blockNumber2)).to.eq.BN(one.muln(245));
      expect(await proposals.votingPower(bob, blockNumber2)).to.eq.BN(one.muln(255));
    });
  });

  context('by delegating', () => {
    describe('only ECO power', () => {
      it('Has the right power for bob after alice delegates here votes to him', async () => {
        await eco.enableDelegation({ from: bob });
        await eco.delegate(bob, { from: alice });
        blockNumber = await time.latestBlock();
        await time.advanceBlock();
        expect(await proposals.votingPower(bob, blockNumber)).to.eq.BN(one.muln(500));
      });
    });
  });

  context('after locking up all ECOx', () => {
    describe('Voting power with ECO and ECOx', async () => {
      beforeEach(async () => {
        // approve deposits
        await ecox.approve(ecoXLockup.address, one.muln(400), { from: alice });
        await ecox.approve(ecoXLockup.address, one.muln(400), { from: bob });
        await ecox.approve(ecoXLockup.address, one.muln(200), { from: charlie });

        // lockup funds
        await ecoXLockup.deposit(one.muln(400), { from: alice });
        await ecoXLockup.deposit(one.muln(400), { from: bob });
        await ecoXLockup.deposit(one.muln(200), { from: charlie });

        // one total generation in lockup before voting
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        blockNumber = await time.latestBlock();
        await time.advanceBlock();
      });

      it('Has the correct total power', async () => {
        // 10k ECO total + 10k ECOx total
        expect(await proposals.totalVotingPower(blockNumber)).to.eq.BN(one.muln(2000));
      });

      it('Has the right power for alice', async () => {
        // 2.5k ECO + 4k ECOx
        expect(await proposals.votingPower(alice, blockNumber)).to.eq.BN(one.muln(650));
      });
    });
  });
});
