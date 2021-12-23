const chai = require('chai');
const bnChai = require('bn-chai');

const Empty = artifacts.require('Empty');
const PolicyProposals = artifacts.require('PolicyProposals');
const PolicyVotes = artifacts.require('PolicyVotes');
const SimplePolicySetter = artifacts.require('SimplePolicySetter');
const Cloner = artifacts.require('Cloner');

const { expect } = chai;
const {
  expectRevert,
  time,
} = require('@openzeppelin/test-helpers');

const util = require('../../tools/test/util');

const { BN, toBN } = web3.utils;
chai.use(bnChai(BN));

contract('ecoXLockup [@group=12]', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];
  let counter = 0;
  let policy;
  let token;
  let faucet;
  let timedPolicies;
  let proposals;
  let testProposal;
  let votes;
  let ecox;
  let ecoXLockup;
  let one;

  beforeEach(async () => {
    one = toBN(10).pow(toBN(18));
    ({
      policy,
      token,
      faucet,
      timedPolicies,
      ecox,
      ecoXLockup,
    } = await util.deployPolicy(accounts[counter], { trustees: [bob] }));
    counter += 1;

    await faucet.mint(alice, one.muln(5000));
    await faucet.mint(bob, one.muln(5000));
    await faucet.mint(charlie, one.muln(10000));

    await faucet.mintx(alice, one.muln(400));
    await faucet.mintx(bob, one.muln(400));
    await faucet.mintx(charlie, one.muln(200));

    await time.increase(3600 * 24 * 14 + 1);
    await timedPolicies.incrementGeneration();

    await time.advanceBlock();
  });

  describe('called early', () => {
    it('reverts', async () => {
      await expectRevert(
        ecoXLockup.notifyGenerationIncrease(),
        'Generation has not increased',
      );
    });
  });

  describe('unauthorized call of recordVote', () => {
    it('reverts', async () => {
      await expectRevert(
        ecoXLockup.recordVote(alice),
        'Must be a voting contract to call',
      );
    });
  });

  async function makeProposals() {
    const policySetter = await SimplePolicySetter.new();
    const implementation = await PolicyProposals.new(
      policy.address,
      (await PolicyVotes.new(policy.address)).address,
      policySetter.address,
    );
    const cloner = await Cloner.new(implementation.address);
    const policyProposalsClone = await PolicyProposals.at(await cloner.clone());
    await policy.testDirectSet(
      'PolicyProposals',
      policyProposalsClone.address,
    );
    return policyProposalsClone;
  }

  context('authed recordVote', () => {
    let blockNumber;

    beforeEach(async () => {
      // we need to get the addresses some voting power
      await ecox.approve(ecoXLockup.address, one.muln(10), { from: alice });
      await ecoXLockup.deposit(one.muln(10), { from: alice });

      await ecox.approve(ecoXLockup.address, one.muln(100), { from: bob });
      await ecoXLockup.deposit(one.muln(100), { from: bob });

      blockNumber = await time.latestBlock();

      await time.increase(3600 * 24 * 14 + 1);
      await timedPolicies.incrementGeneration();
      await time.increase(3600 * 24 * 14 + 1);
      await timedPolicies.incrementGeneration();

      proposals = await makeProposals();

      testProposal = await Empty.new(1);

      await token.approve(
        proposals.address,
        await proposals.COST_REGISTER(),
      );

      await proposals.registerProposal(testProposal.address);
    });

    context('basic token and checkpoints data', async () => {
      // Confirm the internal balance method works
      it('can get the balance', async () => {
        expect(await ecoXLockup.balance(alice)).to.eq.BN(await ecoXLockup.balanceOf(alice));
      });

      it('Can get the past total supply', async () => {
        const pastTotalSupply = await ecoXLockup.totalSupplyAt(blockNumber);
        expect(pastTotalSupply).to.be.eq.BN(one.muln(110));
      });

      it('Can get a past balance', async () => {
        const pastBalance = await ecoXLockup.balanceAt(alice, blockNumber);
        expect(pastBalance).to.be.eq.BN(one.muln(10));
      });
    });

    context('alice supporting a proposal', () => {
      beforeEach(async () => {
        await proposals.support(testProposal.address, { from: alice });
      });

      it('alice successfully added voting support to the proposal', async () => {
        const testProposalObj = await proposals.proposals(testProposal.address);
        expect(testProposalObj.totalstake).to.eq.BN(toBN('5201003341683361150843'));
      });

      it('alice cannot withdraw', async () => {
        await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: alice }), 'Must not vote in the generation on or before withdrawing');
      });

      it('alice can still deposit', async () => {
        await ecox.approve(ecoXLockup.address, one.muln(10), { from: alice });
        await ecoXLockup.deposit(one.muln(10), { from: alice });
      });

      it('alice cannot deposit more than approved', async () => {
        await ecox.approve(ecoXLockup.address, one.muln(10), { from: alice });
        await expectRevert(ecoXLockup.deposit(one.muln(1000), { from: alice }), 'ERC20: transfer amount exceeds balance.');
      });
    });

    context('bob supports a proposal into a vote', () => {
      beforeEach(async () => {
        const tx = await proposals.support(testProposal.address, { from: bob });

        const votesAddress = tx.logs.find((t) => t.event === 'VotingStarted').args.contractAddress;
        votes = await PolicyVotes.at(votesAddress);
      });

      it('bob can vote', async () => {
        await votes.vote(true, { from: bob });
        expect(await votes.yesStake()).to.eq.BN(toBN('7103418361512952496234'));
      });

      it('alice can withdraw then vote', async () => {
        await ecoXLockup.withdraw(one.muln(1), { from: alice });
        await votes.vote(true, { from: alice });
      });

      it('alice cannot vote then withdraw', async () => {
        await votes.vote(true, { from: alice });
        await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: alice }), 'Must not vote in the generation on or before withdrawing');
      });

      it('bob supported, so cannot withdraw', async () => {
        await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: bob }), 'Must not vote in the generation on or before withdrawing');
      });

      it('bob supported, so cannot withdraw in the next generation', async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();

        await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: bob }), 'Must not vote in the generation on or before withdrawing');
      });

      it('bob supported, but can withdraw the generation after next', async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();

        await ecoXLockup.withdraw(one.muln(10), { from: bob });
      });
    });
  });
});
