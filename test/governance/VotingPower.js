const PolicyProposals = artifacts.require('PolicyProposals');

const chai = require('chai');
const bnChai = require('bn-chai');

const { expect } = chai;
const {
  time,
} = require('@openzeppelin/test-helpers');

const util = require('../../tools/test/util');

const { BN, toBN } = web3.utils;
chai.use(bnChai(BN));

contract('VotingPower [@group=2]', ([alice, bob, charlie]) => {
  let policy;
  // let token;
  let balanceStore;
  let faucet;
  let timedPolicies;
  let proposals;
  let blockNumber;
  let ecox;
  let ecoxlockup;
  let one;
  let totalPower;
  let alicePower;

  beforeEach(async () => {
    one = toBN(10).pow(toBN(18));
    ({
      policy,
      balanceStore,
      // token,
      faucet,
      timedPolicies,
      ecox,
      ecoxlockup,
    } = await util.deployPolicy({ trustees: [bob] }));

    await faucet.mint(alice, one.muln(5000));
    await faucet.mint(bob, one.muln(5000));
    await faucet.mint(charlie, one.muln(10000));

    await time.increase(3600 * 24 * 14 + 1);
    await timedPolicies.incrementGeneration();

    await faucet.mintx(alice, one.muln(400));
    await faucet.mintx(bob, one.muln(400));
    await faucet.mintx(charlie, one.muln(200));

    // calculated from the above variables
    totalPower = '54365636569180904707205';
    alicePower = '14836493952825406356497';

    await time.increase(3600 * 24 * 14 + 1);
    await timedPolicies.incrementGeneration();
    blockNumber = await time.latestBlock();
    await time.advanceBlock();

    proposals = await PolicyProposals.at(
      await util.policyFor(policy, web3.utils.soliditySha3('PolicyProposals')),
    );
  });

  context('with nothing locked up', () => {
    describe('only ECO power', () => {
      it('Has the correct total power', async () => {
        // 20k total, no ECOx power
        expect(await proposals.totalVotingPower(blockNumber)).to.eq.BN(one.muln(20000));
      });

      it('Has the right power for alice', async () => {
        // 5k, no ECOx power
        expect(await proposals.votingPower(alice, blockNumber)).to.eq.BN(one.muln(5000));
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
        // The original 20k plus all of alice's power as ECO
        expect(await proposals.totalVotingPower(blockNumber)).to.eq.BN(
          one.muln(15000).add(toBN(alicePower)),
        );
      });

      it('Has the right power for alice', async () => {
        // full power, but all in ECO
        expect(await proposals.votingPower(alice, blockNumber)).to.eq.BN(toBN(alicePower));
      });
    });
  });

  context('after locking up all ECOx', () => {
    describe('Voting power with ECO and ECOx', async () => {
      beforeEach(async () => {
        // approve deposits
        await ecox.approve(ecoxlockup.address, one.muln(400), { from: alice });
        await ecox.approve(ecoxlockup.address, one.muln(400), { from: bob });
        await ecox.approve(ecoxlockup.address, one.muln(200), { from: charlie });

        // lockup funds
        await ecoxlockup.deposit(one.muln(400), { from: alice });
        await ecoxlockup.deposit(one.muln(400), { from: bob });
        await ecoxlockup.deposit(one.muln(200), { from: charlie });

        // one total generation in lockup before voting
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        blockNumber = await time.latestBlock();
        await time.advanceBlock();
      });

      it('Has the correct total power', async () => {
        // 20k total + ECOx power
        expect(await proposals.totalVotingPower(blockNumber)).to.eq.BN(toBN(totalPower));
      });

      it('Has the right power for alice', async () => {
        // 5k + ECOx power
        expect(await proposals.votingPower(alice, blockNumber)).to.eq.BN(toBN(alicePower));
      });
    });

    // describe('After alice converts to ECO', async () => {
    //   beforeEach(async () => {
    //     await ecox.exchange(one.muln(100), { from: alice });
    //     generation = await balanceStore.currentGeneration();
    //     await time.increase(3600 * 24 * 14 + 1);
    //     await timedPolicies.incrementGeneration();

    //     await ecox.exchange(one.muln(100), { from: alice });
    //   });

    //   it('Has the right balances for alice', async () => {
    //     expect(await ecox.balanceOf(alice)).to.eq.BN(one.muln(200));
    //     expect(await token.balanceOf(alice)).to.eq.BN(toBN('9428055163203396678421'));
    //   });

    //   it('Had the right balance on the previous generation', async () => {
    //     expect(await ecox.balanceAt(alice, generation)).to.eq.BN(one.muln(300));
    //     expect(await balanceStore.balanceAt(alice, generation)).to.eq.BN(
    //      toBN('7103418361512952496234')
    //     );
    //   });

    //   it('Has the correct total power', async () => {
    //     // exchanging ecox does not change total power
    //     expect(await proposals.totalVotingPower(generation)).to.eq.BN(toBN(totalPower));
    //   });

    //   it('Has the right power for alice', async () => {
    //     // exchanging ecox does not change your voting power
    //     // we allow a tolerance of 1 eco wei of error
    //     expect(await proposals.votingPower(alice, generation, []))
    //       .to.eq.BN(toBN(alicePower).sub(toBN(1)));
    //   });
    // });
  });
});
