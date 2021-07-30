const PolicyProposals = artifacts.require('PolicyProposals');
const CurrencyGovernance = artifacts.require('CurrencyGovernance');
const Lockup = artifacts.require('Lockup');

const chai = require('chai');
const bnChai = require('bn-chai');

const { expect } = chai;
const {
  time,
} = require('@openzeppelin/test-helpers');

const util = require('../../tools/test/util.js');

const { BN, toBN } = web3.utils;
chai.use(bnChai(BN));

contract('VotingPower [@group=2]', ([alice, bob, charlie]) => {
  let policy;
  let token;
  let balanceStore;
  let faucet;
  let timedPolicies;
  let proposals;
  let generation;
  let ecox;
  let one;
  let currencyTimer;

  beforeEach(async () => {
    one = toBN(10).pow(toBN(18));
    ({
      policy,
      balanceStore,
      token,
      faucet,
      timedPolicies,
      ecox,
      currencyTimer,
    } = await util.deployPolicy({ trustees: [bob] }));

    await faucet.mint(alice, one.muln(5000));
    await faucet.mint(bob, one.muln(5000));
    await faucet.mint(charlie, one.muln(10000));

    await time.increase(3600 * 24 * 40);
    await timedPolicies.incrementGeneration();

    await faucet.mintx(alice, toBN(400));
    await faucet.mintx(bob, toBN(400));
    await faucet.mintx(charlie, toBN(200));

    generation = await balanceStore.currentGeneration();
    await time.increase(3600 * 24 * 40);
    await timedPolicies.incrementGeneration();

    proposals = await PolicyProposals.at(
      await util.policyFor(policy, web3.utils.soliditySha3('PolicyProposals')),
    );
  });

  describe('Voting power with ECO and ECOx', async () => {
    it('Has the correct total power', async () => {
      // 20k total + ECOx power (50% of total ECO)
      expect(await proposals.totalVotingPower(generation)).to.eq.BN(one.muln(30000));
    });

    it('Has the right power for alice', async () => {
      // 5k + 40% of the 10k from ECOx.
      expect(await proposals.votingPower(alice, generation, [])).to.eq.BN(one.muln(9000));
    });
  });

  describe('After alice converts to ECO', async () => {
    beforeEach(async () => {
      await ecox.exchange(toBN(100), { from: alice });
      generation = await balanceStore.currentGeneration();
      await time.increase(3600 * 24 * 40);
      await timedPolicies.incrementGeneration();

      await ecox.exchange(toBN(100), { from: alice });
    });

    it('Has the right balances for alice', async () => {
      expect(await ecox.balanceOf(alice)).to.eq.BN(200);
      // 5k start + 20% of total ECOx capacity (10k)
      expect(await token.balanceOf(alice)).to.eq.BN(one.muln(7000));

      expect(await ecox.balanceAt(alice, generation)).to.eq.BN(300);
      expect(await balanceStore.balanceAt(alice, generation)).to.eq.BN(one.muln(6000));
    });

    it('Has the correct total power', async () => {
      // 20k total + ECOx power (50% of total ECO)
      expect(await proposals.totalVotingPower(generation)).to.eq.BN(one.muln(30000));
    });

    it('Has the right power for alice', async () => {
      // 5k + 40% of the 10k from ECOx.
      expect(await proposals.votingPower(alice, generation, [])).to.eq.BN(one.muln(9000));
    });
  });

  describe('After alice converts to ECO with a Lockup', async () => {
    let lockup;
    beforeEach(async () => {
      const hash = (x) => web3.utils.soliditySha3(
        { type: 'bytes32', value: x[0] },
        { type: 'address', value: x[1] },
        { type: 'address', value: x[2] },
      );

      const borda = await CurrencyGovernance.at(
        await util.policyFor(policy, await timedPolicies.ID_CURRENCY_GOVERNANCE()),
      );

      // Proposal with 10% lockup
      await borda.propose(0, 0, 30, toBN('100000000'), toBN('1000000000000000000'), { from: bob });
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

      await ecox.exchange(toBN(100), { from: alice });
      generation = await balanceStore.currentGeneration();
      await time.increase(3600 * 24 * 40);
      await timedPolicies.incrementGeneration();
    });

    it('Has the right balances for alice', async () => {
      expect(await ecox.balanceOf(alice)).to.eq.BN(300);
      expect(await token.balanceOf(alice)).to.eq.BN(one.muln(5000));
      expect(await lockup.depositBalances(alice)).to.eq.BN(one.muln(1000));
    });

    it('Lockup has the right balances', async () => {
      expect(await token.balanceOf(lockup.address)).to.eq.BN(one.muln(1100));
      expect(await balanceStore.balanceAt(lockup.address, generation)).to.eq.BN(one.muln(1000));
    });

    it('Has the correct total power', async () => {
      // 20k total + ECOx power (50% of total ECO)
      expect(await proposals.totalVotingPower(generation)).to.eq.BN(one.muln(30000));
    });

    it('Has the right power for alice without lockup', async () => {
      expect(await proposals.votingPower(alice, generation, [])).to.eq.BN(one.muln(8000));
    });

    it('Has the right power for alice with lockup', async () => {
      expect(await proposals.votingPower(alice, generation, [generation])).to.eq.BN(one.muln(9000));
    });
  });
});
