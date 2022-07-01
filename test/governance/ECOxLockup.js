const chai = require('chai');
const bnChai = require('bn-chai');

const Empty = artifacts.require('Empty');
const PolicyProposals = artifacts.require('PolicyProposals');
const PolicyVotes = artifacts.require('PolicyVotes');
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
  let eco;
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
      eco,
      faucet,
      timedPolicies,
      ecox,
      ecoXLockup,
    } = await util.deployPolicy(accounts[counter], { trustednodes: [bob] }));
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

  describe('unauthorized call of recordVote', () => {
    it('reverts', async () => {
      await expectRevert(
        ecoXLockup.recordVote(alice),
        'Must be a voting contract to call',
      );
    });
  });

  describe('disabled ERC20 functionality', () => {
    it('reverts on transfer', async () => {
      await expectRevert(
        ecoXLockup.transfer(alice, 1000),
        'sECOx is non-transferrable',
      );
    });

    it('reverts on transferFrom', async () => {
      await expectRevert(
        ecoXLockup.transferFrom(alice, bob, 1000),
        'sECOx is non-transferrable',
      );
    });
  });

  async function makeProposals() {
    const implementation = await PolicyProposals.new(
      policy.address,
      (await PolicyVotes.new(
        policy.address,
        eco.address,
        ecox.address,
      )).address,
      eco.address,
      ecox.address,
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

      await ecox.approve(ecoXLockup.address, one.muln(100), { from: charlie });
      await ecoXLockup.deposit(one.muln(100), { from: charlie });

      blockNumber = await time.latestBlock();

      await time.increase(3600 * 24 * 14 + 1);
      await timedPolicies.incrementGeneration();
      await time.increase(3600 * 24 * 14 + 1);
      await timedPolicies.incrementGeneration();

      proposals = await makeProposals();

      testProposal = await Empty.new(1);

      await eco.approve(
        proposals.address,
        await proposals.COST_REGISTER(),
      );

      await proposals.registerProposal(testProposal.address);
    });

    context('basic token and checkpoints data', async () => {
      // Confirm the internal balance method works
      it('can get the balance', async () => {
        expect(await ecoXLockup.balanceOf(alice)).to.eq.BN(one.muln(10));
      });

      it('Can get the past total supply', async () => {
        const pastTotalSupply = await ecoXLockup.totalSupplyAt(blockNumber);
        expect(pastTotalSupply).to.be.eq.BN(one.muln(110));
      });

      it('Can get a past balance', async () => {
        const pastBalance = await ecoXLockup.getPastVotes(alice, blockNumber);
        expect(pastBalance).to.be.eq.BN(one.muln(10));
      });
    });

    context('alice supporting a proposal', () => {
      beforeEach(async () => {
        await proposals.support(testProposal.address, { from: alice });
      });

      it('alice successfully added voting support to the proposal', async () => {
        const testProposalObj = await proposals.proposals(testProposal.address);
        expect(testProposalObj.totalStake).to.eq.BN(toBN('5010000000000000000000'));
      });

      it('alice cannot withdraw', async () => {
        await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: alice }), 'Must not vote or undelegate in the generation on or before withdrawing');
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

    context('charlie supports a proposal into a vote', () => {
      beforeEach(async () => {
        await proposals.support(testProposal.address, { from: charlie });
        const tx = await proposals.deployProposalVoting({ from: charlie });

        const votesAddress = tx.logs.find((t) => t.event === 'VoteStart').args.contractAddress;
        votes = await PolicyVotes.at(votesAddress);
      });

      it('charlie can vote', async () => {
        await votes.vote(true, { from: charlie });
        expect(await votes.yesStake()).to.eq.BN(toBN('10100000000000000000000'));
      });

      it('alice can withdraw then vote', async () => {
        await ecoXLockup.withdraw(one.muln(1), { from: alice });
        await votes.vote(true, { from: alice });
      });

      it('alice cannot vote then withdraw', async () => {
        await votes.vote(true, { from: alice });
        await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: alice }), 'Must not vote or undelegate in the generation on or before withdrawing');
      });

      it('charlie supported, so cannot withdraw', async () => {
        await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: charlie }), 'Must not vote or undelegate in the generation on or before withdrawing');
      });

      it('charlie supported, so cannot withdraw in the next generation', async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();

        await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: charlie }), 'Must not vote or undelegate in the generation on or before withdrawing');
      });

      it('charlie supported, but can withdraw the generation after next', async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();

        await ecoXLockup.withdraw(one.muln(10), { from: charlie });
      });
    });
  });

  context('delegation and withdrawals', () => {
    beforeEach(async () => {
      // we need to get the addresses some voting power
      await ecox.approve(ecoXLockup.address, one.muln(10), { from: alice });
      await ecoXLockup.deposit(one.muln(10), { from: alice });

      await ecox.approve(ecoXLockup.address, one.muln(100), { from: bob });
      await ecoXLockup.deposit(one.muln(100), { from: bob });

      await ecoXLockup.enableDelegation({ from: bob });
    });

    it('delegate works as expected', async () => {
      await ecoXLockup.delegate(bob, { from: alice });
      const blockNumber = await time.latestBlock();
      await time.increase(10);
      expect(await ecoXLockup.getVotingGons(bob)).to.eq.BN(one.muln(110));
      expect(await ecoXLockup.votingECOx(bob, blockNumber)).to.eq.BN(one.muln(110));
    });

    context('undelegate transfers voting record', () => {
      beforeEach(async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();

        proposals = await makeProposals();

        testProposal = await Empty.new(1);

        await eco.approve(
          proposals.address,
          await proposals.COST_REGISTER(),
        );

        await proposals.registerProposal(testProposal.address);
      });

      context('delegatee did not vote', () => {
        beforeEach(async () => {
          await ecoXLockup.delegate(bob, { from: alice });
        });

        it('no effect on withdrawal', async () => {
          await ecoXLockup.undelegate({ from: alice });
          await ecoXLockup.withdraw(one.muln(10), { from: alice });
        });

        it('can withdraw without undelegating', async () => {
          await ecoXLockup.withdraw(one.muln(10), { from: alice });
        });
      });

      context('delegatee did vote', () => {
        beforeEach(async () => {
          await ecoXLockup.delegate(bob, { from: alice });
          await proposals.support(testProposal.address, { from: bob });
          await time.advanceBlock();
        });

        context('immediately after the vote', () => {
          it('blocks if delegatee did vote', async () => {
            await ecoXLockup.undelegate({ from: alice });
            await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: alice }), 'Must not vote or undelegate in the generation on or before withdrawing');
          });

          it('cannot withdraw without undelegating', async () => {
            await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: alice }), 'Must not vote or undelegate in the generation on or before withdrawing');
          });

          it('undelegateFromAddress blocks withdrawal', async () => {
            await ecoXLockup.undelegateFromAddress(bob, { from: alice });
            await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: alice }), 'Must not vote or undelegate in the generation on or before withdrawing');
          });
        });

        context('1 generation after the vote', () => {
          beforeEach(async () => {
            await time.increase(3600 * 24 * 14 + 1);
            await timedPolicies.incrementGeneration();
          });

          it('blocks if delegatee did vote', async () => {
            await ecoXLockup.undelegate({ from: alice });
            await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: alice }), 'Must not vote or undelegate in the generation on or before withdrawing');
          });

          it('cannot withdraw without undelegating', async () => {
            await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: alice }), 'Must not vote or undelegate in the generation on or before withdrawing');
          });

          it('undelegateFromAddress blocks withdrawal', async () => {
            await ecoXLockup.undelegateFromAddress(bob, { from: alice });
            await expectRevert(ecoXLockup.withdraw(one.muln(10), { from: alice }), 'Must not vote or undelegate in the generation on or before withdrawing');
          });
        });

        context('2 generations after the vote', () => {
          beforeEach(async () => {
            await time.increase(3600 * 24 * 14 + 1);
            await timedPolicies.incrementGeneration();
            await time.increase(3600 * 24 * 14 + 1);
            await timedPolicies.incrementGeneration();
          });

          it('can now withdraw', async () => {
            await ecoXLockup.undelegate({ from: alice });
            await ecoXLockup.withdraw(one.muln(10), { from: alice });
          });

          it('can withdraw without undelegating', async () => {
            await ecoXLockup.withdraw(one.muln(10), { from: alice });
          });

          it('undelegateFromAddress dose not block withdrawal', async () => {
            await ecoXLockup.undelegateFromAddress(bob, { from: alice });
            await ecoXLockup.withdraw(one.muln(10), { from: alice });
          });
        });
      });

      context('partial delegation', () => {
        it('can still withdraw if delegation is partial', async () => {
          await ecoXLockup.delegateAmount(bob, one.muln(5), { from: alice });
          await proposals.support(testProposal.address, { from: bob });
          await ecoXLockup.withdraw(one.muln(5), { from: alice });
        });
      });
    });
  });
});
