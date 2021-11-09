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
  expectEvent,
  time,
} = require('@openzeppelin/test-helpers');

const util = require('../../tools/test/util');

const { BN, toBN } = web3.utils;
chai.use(bnChai(BN));

contract('ECOxLockup [@group=12]', ([alice, bob, charlie]) => {
  let policy;
  let token;
  let balanceStore;
  let faucet;
  let timedPolicies;
  let result;
  let proposals;
  let testProposal;
  let votes;
  let generation;
  let ecox;
  let ecoxlockup;
  let one;

  beforeEach(async () => {
    one = toBN(10).pow(toBN(18));
    ({
      policy,
      balanceStore,
      token,
      faucet,
      timedPolicies,
      ecox,
      ecoxlockup,
    } = await util.deployPolicy({ trustees: [bob] }));

    await faucet.mint(alice, one.muln(5000));
    await faucet.mint(bob, one.muln(5000));
    await faucet.mint(charlie, one.muln(10000));

    await faucet.mintx(alice, one.muln(400));
    await faucet.mintx(bob, one.muln(400));
    await faucet.mintx(charlie, one.muln(200));

    await time.increase(3600 * 24 * 14 + 1);
    await timedPolicies.incrementGeneration();

    generation = await balanceStore.currentGeneration();
  });

  context('deposit', () => {
    it('cannot deposit without allowance', async () => {
      await expectRevert(ecoxlockup.deposit(one.muln(400), { from: alice }), 'Insufficient allowance for transfer');
      expect(await ecoxlockup.balance(alice)).to.eq.BN(0);
    });

    context('can deposit with allowance', async () => {
      beforeEach(async () => {
        await ecox.approve(ecoxlockup.address, one.muln(400), { from: alice });
        result = await ecoxlockup.deposit(one.muln(400), { from: alice });
      });

      it('alice has the right balance in the lockup', async () => {
        expect(await ecoxlockup.balance(alice)).to.eq.BN(one.muln(400));
      });

      it('alice has the right balance before the deposit', async () => {
        expect(await ecoxlockup.balanceAt(alice, generation - 1)).to.eq.BN(0);
      });

      it('the lockup has the right total balance', async () => {
        expect(await ecoxlockup.tokenSupply()).to.eq.BN(one.muln(400));
      });

      it('the deposit emitted the correct event', async () => {
        await expectEvent.inTransaction(result.tx, ecoxlockup.constructor, 'Deposit', { source: alice, amount: one.muln(400).toString() });
      });
    });

    it('cannot deposit more than balance', async () => {
      await ecox.approve(ecoxlockup.address, one.muln(400), { from: charlie });
      await expectRevert(ecoxlockup.deposit(one.muln(400), { from: charlie }), 'Source account has insufficient tokens');
    });

    it('depositing after multiple generations of inactivity updates correctly', async () => {
      await ecox.approve(ecoxlockup.address, one.muln(100), { from: alice });
      await ecoxlockup.deposit(one.muln(100), { from: alice });
      expect(await ecoxlockup.balance(alice)).to.eq.BN(one.muln(100));

      await time.increase(3600 * 24 * 14 + 1);
      await timedPolicies.incrementGeneration();
      await time.increase(3600 * 24 * 14 + 1);
      await timedPolicies.incrementGeneration();
      generation = await balanceStore.currentGeneration();

      await ecox.approve(ecoxlockup.address, one.muln(100), { from: alice });
      await ecoxlockup.deposit(one.muln(100), { from: alice });
      expect(await ecoxlockup.balance(alice)).to.eq.BN(one.muln(200));
      expect(await ecoxlockup.balanceAt(alice, generation - 1)).to.eq.BN(one.muln(100));
      expect(await ecoxlockup.balanceAt(alice, generation - 2)).to.eq.BN(one.muln(100));
      expect(await ecoxlockup.balanceAt(alice, generation - 3)).to.eq.BN(0);
    });

    context('multiple deposits tracks balance correctly', async () => {
      context('alice deposits twice', () => {
        beforeEach(async () => {
          await ecox.approve(ecoxlockup.address, one.muln(200), { from: alice });
          await ecoxlockup.deposit(one.muln(200), { from: alice });
          await ecox.approve(ecoxlockup.address, one.muln(200), { from: alice });
          await ecoxlockup.deposit(one.muln(200), { from: alice });
          generation = await balanceStore.currentGeneration();
        });

        it('alice has the right balance in the lockup', async () => {
          expect(await ecoxlockup.balance(alice)).to.eq.BN(one.muln(400));
        });

        it('alice has the right balance before the deposit', async () => {
          expect(await ecoxlockup.balanceAt(alice, generation - 1)).to.eq.BN(0);
        });

        it('the lockup has the right total balance', async () => {
          expect(await ecoxlockup.tokenSupply()).to.eq.BN(one.muln(400));
        });

        it('the lockup has the right total balance the generation before', async () => {
          expect(await ecoxlockup.totalSupplyAt(generation - 1)).to.eq.BN(0);
        });
      });

      context('alice deposits in multiple generations', () => {
        beforeEach(async () => {
          await ecox.approve(ecoxlockup.address, one.muln(200), { from: alice });
          await ecoxlockup.deposit(one.muln(200), { from: alice });
          await time.increase(3600 * 24 * 14 + 1);
          await timedPolicies.incrementGeneration();
          generation = await balanceStore.currentGeneration();
          await ecox.approve(ecoxlockup.address, one.muln(200), { from: alice });
          await ecoxlockup.deposit(one.muln(200), { from: alice });
        });

        it('alice has the right balance in the lockup', async () => {
          expect(await ecoxlockup.balance(alice)).to.eq.BN(one.muln(400));
        });

        it('alice has the right balance after the first deposit', async () => {
          expect(await ecoxlockup.balanceAt(alice, generation - 1)).to.eq.BN(one.muln(200));
        });

        it('alice has the right balance before the deposit', async () => {
          expect(await ecoxlockup.balanceAt(alice, generation - 2)).to.eq.BN(0);
        });

        it('the lockup has the right total balance', async () => {
          expect(await ecoxlockup.tokenSupply()).to.eq.BN(one.muln(400));
        });

        it('the lockup has the right total balance after the first deposit', async () => {
          expect(await ecoxlockup.totalSupplyAt(generation - 1)).to.eq.BN(one.muln(200));
        });

        it('the lockup has the right total balance before deposits', async () => {
          expect(await ecoxlockup.totalSupplyAt(generation - 2)).to.eq.BN(0);
        });
      });

      context('everyone deposits in multiple generations', () => {
        beforeEach(async () => {
          await ecox.approve(ecoxlockup.address, one.muln(202), { from: alice });
          await ecoxlockup.deposit(one.muln(202), { from: alice });
          await time.increase(3600 * 24 * 14 + 1);
          await timedPolicies.incrementGeneration();
          await ecox.approve(ecoxlockup.address, one.muln(201), { from: bob });
          await ecoxlockup.deposit(one.muln(201), { from: bob });
          await time.increase(3600 * 24 * 14 + 1);
          await timedPolicies.incrementGeneration();
          generation = await balanceStore.currentGeneration();
          await ecox.approve(ecoxlockup.address, one.muln(200), { from: charlie });
          await ecoxlockup.deposit(one.muln(200), { from: charlie });
        });

        context('current generation', () => {
          it('alice has the right balance in the lockup', async () => {
            expect(await ecoxlockup.balance(alice)).to.eq.BN(one.muln(202));
          });

          it('bob has the right balance in the lockup', async () => {
            expect(await ecoxlockup.balance(bob)).to.eq.BN(one.muln(201));
          });

          it('charlie has the right balance in the lockup', async () => {
            expect(await ecoxlockup.balance(charlie)).to.eq.BN(one.muln(200));
          });
        });

        context('generation - 1', () => {
          it('alice has the right balance at generation-1', async () => {
            expect(await ecoxlockup.balanceAt(alice, generation - 1)).to.eq.BN(one.muln(202));
          });

          it('bob has the right balance at generation-1', async () => {
            expect(await ecoxlockup.balanceAt(bob, generation - 1)).to.eq.BN(one.muln(201));
          });

          it('charlie has the right balance at generation-1', async () => {
            expect(await ecoxlockup.balanceAt(charlie, generation - 1)).to.eq.BN(0);
          });
        });

        context('generation - 2', () => {
          it('alice has the right balance at generation-2', async () => {
            expect(await ecoxlockup.balanceAt(alice, generation - 2)).to.eq.BN(one.muln(202));
          });

          it('bob has the right balance at generation-2', async () => {
            expect(await ecoxlockup.balanceAt(bob, generation - 2)).to.eq.BN(0);
          });

          it('charlie has the right balance at generation-2', async () => {
            expect(await ecoxlockup.balanceAt(charlie, generation - 2)).to.eq.BN(0);
          });
        });

        context('generation - 3', () => {
          it('alice has the right balance before the deposit', async () => {
            expect(await ecoxlockup.balanceAt(alice, generation - 3)).to.eq.BN(0);
          });

          it('bob has the right balance before the deposit', async () => {
            expect(await ecoxlockup.balanceAt(bob, generation - 3)).to.eq.BN(0);
          });

          it('charlie has the right balance before the deposit', async () => {
            expect(await ecoxlockup.balanceAt(charlie, generation - 3)).to.eq.BN(0);
          });
        });

        context('total balance', () => {
          it('the lockup has the right total balance', async () => {
            expect(await ecoxlockup.tokenSupply()).to.eq.BN(one.muln(603));
          });

          it('the lockup  has the right balance at generation-1', async () => {
            expect(await ecoxlockup.totalSupplyAt(generation - 1)).to.eq.BN(one.muln(403));
          });

          it('the lockup  has the right balance at generation-2', async () => {
            expect(await ecoxlockup.totalSupplyAt(generation - 2)).to.eq.BN(one.muln(202));
          });

          it('the lockup has the right total balance before deposits', async () => {
            expect(await ecoxlockup.totalSupplyAt(generation - 3)).to.eq.BN(0);
          });
        });
      });
    });
  });

  context('withdraw', () => {
    context('without balance', () => {
      it('cannot withdraw', async () => {
        await expectRevert(ecoxlockup.withdraw(one.muln(101), { from: alice }), 'Insufficient funds to withdraw');
      });
    });

    context('with balance', () => {
      beforeEach(async () => {
        await ecox.approve(ecoxlockup.address, one.muln(300), { from: alice });
        await ecoxlockup.deposit(one.muln(300), { from: alice });
      });

      it('can withdraw', async () => {
        await ecoxlockup.withdraw(one.muln(101), { from: alice });
        expect(await ecox.balanceOf(alice)).to.eq.BN(one.muln(201));
        expect(await ecoxlockup.balance(alice)).to.eq.BN(one.muln(199));
      });

      it('cannot withdraw more than balance', async () => {
        await expectRevert(ecoxlockup.withdraw(one.muln(301), { from: alice }), 'Insufficient funds to withdraw');
        expect(await ecox.balanceOf(alice)).to.eq.BN(one.muln(100));
        expect(await ecoxlockup.balance(alice)).to.eq.BN(one.muln(300));
      });

      it('can withdraw after a generation', async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        generation = await balanceStore.currentGeneration();

        await ecoxlockup.withdraw(one.muln(101), { from: alice });
        expect(await ecox.balanceOf(alice)).to.eq.BN(one.muln(201));
        expect(await ecoxlockup.balance(alice)).to.eq.BN(one.muln(199));
      });

      it('the withdrawal emitted the correct event', async () => {
        result = await ecoxlockup.withdraw(one.muln(101), { from: alice });
        await expectEvent.inTransaction(result.tx, ecoxlockup.constructor, 'Withdrawal', { destination: alice, amount: one.muln(101).toString() });
      });
    });
  });

  context('votingECOx and totalVotingECOx', () => {
    beforeEach(async () => {
      await ecox.approve(ecoxlockup.address, one.muln(200), { from: alice });
      result = await ecoxlockup.deposit(one.muln(200), { from: alice });

      await ecox.approve(ecoxlockup.address, one.muln(200), { from: bob });
      result = await ecoxlockup.deposit(one.muln(200), { from: bob });
    });

    context('reverts', () => {
      it('cannot look at future generations for votingECOx', async () => {
        await expectRevert(ecoxlockup.votingECOx(alice, generation + 1), 'Must look at current or previous generation');
      });

      it('cannot look at future generations for totalVotingECOx', async () => {
        await expectRevert(ecoxlockup.totalVotingECOx(generation + 1), 'Must look at current or previous generation');
      });
    });

    context('does not wait', () => {
      it('alice has no voting power immediately', async () => {
        expect(await ecoxlockup.votingECOx(alice, generation)).to.eq.BN(0);
        expect(await ecoxlockup.totalVotingECOx(generation)).to.eq.BN(0);
      });
    });

    context('waits until the next generation to act', () => {
      beforeEach(async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        generation = await balanceStore.currentGeneration();
      });

      it('alice has no voting power on the next generation', async () => {
        expect(await ecoxlockup.votingECOx(alice, generation)).to.eq.BN(0);
        expect(await ecoxlockup.totalVotingECOx(generation)).to.eq.BN(0);
      });

      it('can withdraw and still vote in the subsequent generation with reduced power', async () => {
        await ecoxlockup.withdraw(one.muln(101), { from: alice });

        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        generation = await balanceStore.currentGeneration();
        expect(await ecoxlockup.votingECOx(alice, generation)).to.eq.BN(one.muln(99));
        expect(await ecoxlockup.totalVotingECOx(generation)).to.eq.BN(one.muln(299));
      });

      it('timing for withdrawals does not effect reduced power in subsequent generation', async () => {
        await ecoxlockup.withdraw(one.muln(51), { from: alice });

        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        generation = await balanceStore.currentGeneration();

        await ecoxlockup.withdraw(one.muln(50), { from: alice });

        expect(await ecoxlockup.votingECOx(alice, generation)).to.eq.BN(one.muln(99));
        expect(await ecoxlockup.totalVotingECOx(generation)).to.eq.BN(one.muln(299));
      });

      it('withdrawing and then depositing back correctly handled (prev generation)', async () => {
        await ecoxlockup.withdraw(one.muln(51), { from: alice });
        await ecox.approve(ecoxlockup.address, one.muln(51), { from: alice });
        await ecoxlockup.deposit(one.muln(51), { from: alice });

        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        generation = await balanceStore.currentGeneration();

        expect(await ecoxlockup.votingECOx(alice, generation)).to.eq.BN(one.muln(149));
        expect(await ecoxlockup.totalVotingECOx(generation)).to.eq.BN(one.muln(349));
      });

      it('withdrawing and then depositing back correctly handled (different generation)', async () => {
        await ecoxlockup.withdraw(one.muln(51), { from: alice });

        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        generation = await balanceStore.currentGeneration();

        await ecox.approve(ecoxlockup.address, one.muln(51), { from: alice });
        await ecoxlockup.deposit(one.muln(51), { from: alice });

        expect(await ecoxlockup.votingECOx(alice, generation)).to.eq.BN(one.muln(149));
        expect(await ecoxlockup.totalVotingECOx(generation)).to.eq.BN(one.muln(349));
      });

      it('withdrawing and then depositing back correctly handled (current generation)', async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        generation = await balanceStore.currentGeneration();

        await ecoxlockup.withdraw(one.muln(51), { from: alice });
        await ecox.approve(ecoxlockup.address, one.muln(51), { from: alice });
        await ecoxlockup.deposit(one.muln(51), { from: alice });

        expect(await ecoxlockup.votingECOx(alice, generation)).to.eq.BN(one.muln(149));
        expect(await ecoxlockup.totalVotingECOx(generation)).to.eq.BN(one.muln(349));
      });

      it('adding more deposits still gives the old power', async () => {
        await ecox.approve(ecoxlockup.address, one.muln(51), { from: alice });
        await ecoxlockup.deposit(one.muln(51), { from: alice });

        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        generation = await balanceStore.currentGeneration();

        await ecox.approve(ecoxlockup.address, one.muln(52), { from: alice });
        await ecoxlockup.deposit(one.muln(51), { from: alice });

        expect(await ecoxlockup.votingECOx(alice, generation)).to.eq.BN(one.muln(200));
        expect(await ecoxlockup.totalVotingECOx(generation)).to.eq.BN(one.muln(400));
      });
    });

    context('waits until after full generation passes to act', () => {
      beforeEach(async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        generation = await balanceStore.currentGeneration();
      });

      it('alice has her valid ecox to vote', async () => {
        expect(await ecoxlockup.votingECOx(alice, generation)).to.eq.BN(one.muln(200));
        expect(await ecoxlockup.votingECOx(bob, generation)).to.eq.BN(one.muln(200));
        expect(await ecoxlockup.totalVotingECOx(generation)).to.eq.BN(one.muln(400));
      });

      it('withdraws and has reduced voting power', async () => {
        await ecoxlockup.withdraw(one.muln(101), { from: alice });
        expect(await ecoxlockup.votingECOx(alice, generation)).to.eq.BN(one.muln(99));
        expect(await ecoxlockup.totalVotingECOx(generation)).to.eq.BN(one.muln(299));
      });

      it('withdrawals total is all that matters for reduced voting power', async () => {
        await ecoxlockup.withdraw(one.muln(10), { from: alice });
        await ecoxlockup.withdraw(one.muln(10), { from: alice });
        await ecoxlockup.withdraw(one.muln(10), { from: alice });
        await ecoxlockup.withdraw(one.muln(10), { from: alice });
        await ecoxlockup.withdraw(one.muln(10), { from: alice });

        await ecoxlockup.withdraw(one.muln(10), { from: alice });
        await ecoxlockup.withdraw(one.muln(10), { from: alice });
        await ecoxlockup.withdraw(one.muln(10), { from: alice });
        await ecoxlockup.withdraw(one.muln(10), { from: alice });
        await ecoxlockup.withdraw(one.muln(10), { from: alice });

        await ecoxlockup.withdraw(one.muln(1), { from: alice });
        expect(await ecoxlockup.votingECOx(alice, generation)).to.eq.BN(one.muln(99));
        expect(await ecoxlockup.totalVotingECOx(generation)).to.eq.BN(one.muln(299));
      });
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

  context('unauthed recordVote', () => {
    it('cannot call recordVote as unauthed contract', async () => {
      await expectRevert(ecoxlockup.recordVote(alice), 'Must be a voting contract to call');
    });
  });

  context('authed recordVote', () => {
    beforeEach(async () => {
      // we need to get the addresses some voting power
      await ecox.approve(ecoxlockup.address, one.muln(10), { from: alice });
      result = await ecoxlockup.deposit(one.muln(10), { from: alice });

      await ecox.approve(ecoxlockup.address, one.muln(100), { from: bob });
      result = await ecoxlockup.deposit(one.muln(100), { from: bob });

      await time.increase(3600 * 24 * 14 + 1);
      await timedPolicies.incrementGeneration();
      await time.increase(3600 * 24 * 14 + 1);
      await timedPolicies.incrementGeneration();
      generation = await balanceStore.currentGeneration();

      proposals = await makeProposals();

      testProposal = await Empty.new(1);

      await token.approve(
        proposals.address,
        await proposals.COST_REGISTER(),
      );

      await proposals.registerProposal(testProposal.address);
    });

    context('alice supporting a proposal', () => {
      beforeEach(async () => {
        await proposals.support(testProposal.address, [], { from: alice });
      });

      it('alice successfully added voting support to the proposal', async () => {
        const testProposalObj = await proposals.proposals(testProposal.address);
        expect(testProposalObj.totalstake).to.eq.BN(toBN('5201003341683361150843'));
      });

      it('alice cannot withdraw', async () => {
        await expectRevert(ecoxlockup.withdraw(one.muln(10), { from: alice }), 'Must not vote in the generation on or before withdrawing');
      });

      it('alice can still deposit', async () => {
        await ecox.approve(ecoxlockup.address, one.muln(10), { from: alice });
        result = await ecoxlockup.deposit(one.muln(10), { from: alice });
      });
    });

    context('bob supports a proposal into a vote', () => {
      beforeEach(async () => {
        const tx = await proposals.support(testProposal.address, [], { from: bob });

        const votesAddress = tx.logs.find((t) => t.event === 'VotingStarted').args.contractAddress;
        votes = await PolicyVotes.at(votesAddress);
      });

      it('bob can vote', async () => {
        await votes.vote(true, [], { from: bob });
        expect(await votes.yesStake()).to.eq.BN(toBN('7103418361512952496234'));
      });

      it('alice can withdraw then vote', async () => {
        await ecoxlockup.withdraw(one.muln(1), { from: alice });
        await votes.vote(true, [], { from: alice });
      });

      it('alice cannot vote then withdraw', async () => {
        await votes.vote(true, [], { from: alice });
        await expectRevert(ecoxlockup.withdraw(one.muln(10), { from: alice }), 'Must not vote in the generation on or before withdrawing');
      });

      it('bob supported, so cannot withdraw', async () => {
        await expectRevert(ecoxlockup.withdraw(one.muln(10), { from: bob }), 'Must not vote in the generation on or before withdrawing');
      });

      it('bob supported, so cannot withdraw in the next generation', async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();

        await expectRevert(ecoxlockup.withdraw(one.muln(10), { from: bob }), 'Must not vote in the generation on or before withdrawing');
      });

      it('bob supported, but can withdraw the generation after next', async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();

        await ecoxlockup.withdraw(one.muln(10), { from: bob });
      });
    });
  });
});
