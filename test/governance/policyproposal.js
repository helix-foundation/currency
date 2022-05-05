const PolicyProposals = artifacts.require('PolicyProposals');
const PolicyVotes = artifacts.require('PolicyVotes');
const SimplePolicySetter = artifacts.require('SimplePolicySetter');
const Empty = artifacts.require('Empty');
const Cloner = artifacts.require('Cloner');
const chai = require('chai');
const bnChai = require('bn-chai');

const { assert, expect } = chai;
const {
  expectEvent, expectRevert, constants, time,
} = require('@openzeppelin/test-helpers');

const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers/src/constants');
const util = require('../../tools/test/util');

const { BN, toBN } = web3.utils;
chai.use(bnChai(BN));

contract('PolicyProposals [@group=7]', (accounts) => {
  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];
  const dave = accounts[3];
  let counter = 0;
  let policy;
  let eco;
  let initInflation;
  let timedPolicies;

  beforeEach(async () => {
    ({
      policy,
      eco,
      initInflation,
      timedPolicies,
    } = await util.deployPolicy(accounts[counter]));
    counter += 1;

    await initInflation.mint(eco.address, alice, toBN(10).pow(toBN(18)).muln(5000));
    await initInflation.mint(eco.address, bob, toBN(10).pow(toBN(18)).muln(5000));
    await initInflation.mint(eco.address, charlie, toBN(10).pow(toBN(18)).muln(10000));
    await time.increase(3600 * 24 * 40);
    await timedPolicies.incrementGeneration();
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

  describe('registerProposal', () => {
    let policyProposals;
    let testProposal;
    let testProposal2;

    beforeEach(async () => {
      policyProposals = await makeProposals();
      testProposal = await Empty.new(1);
      testProposal2 = await Empty.new(2);
    });

    context('during the registration period', () => {
      context('when the fee is not approved', () => {
        it('cannot register a proposal', async () => {
          await expectRevert(
            policyProposals.registerProposal(testProposal.address),
            'ERC20: transfer amount exceeds allowance.',
          );
        });
      });

      context('when the fee is pre-approved', () => {
        beforeEach(async () => {
          await eco.approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER(),
          );
        });

        it('can\'t register a zero address proposal', async () => {
          await expectRevert(
            policyProposals.registerProposal('0x0000000000000000000000000000000000000000'),
            'The proposal address can\'t be 0',
          );
        });

        it('can register a proposal', async () => {
          await policyProposals.registerProposal(testProposal.address);
        });

        it('updates the allProposalAddresses index', async () => {
          await policyProposals.registerProposal(testProposal.address);
          const allProposalAddresses = await policyProposals.allProposalAddresses();
          assert.deepEqual(allProposalAddresses, [testProposal.address]);
        });

        it('starts with the correct supporting stake', async () => {
          await policyProposals.registerProposal(testProposal.address);

          const stake = toBN(
            (await policyProposals.proposals(testProposal.address))[2],
          );

          assert.equal(
            stake.toString(),
            '0',
          );
        });

        it('emits the ProposalAdded event', async () => {
          const result = await policyProposals.registerProposal(testProposal.address);
          await expectEvent.inTransaction(
            result.tx,
            policyProposals.constructor,
            'ProposalAdded',
          );
        });
      });

      context('when the proposal has already been registered', () => {
        beforeEach(async () => {
          await eco.approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER(),
          );

          await policyProposals.registerProposal(testProposal.address);

          await eco.approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER(),
          );
        });

        it('cannot register a second time', async () => {
          await expectRevert(
            policyProposals.registerProposal(testProposal.address),
            'proposal may only be registered once',
          );
        });
      });

      context('when a different proposal has already been selected', () => {
        beforeEach(async () => {
          await eco.approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER(),
          );

          await policyProposals.registerProposal(testProposal.address);

          await policyProposals.support(testProposal.address, { from: charlie });

          await eco.approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER(),
          );
        });

        it('reverts', async () => {
          await expectRevert(
            policyProposals.registerProposal(testProposal2.address),
            'Proposals may no longer be registered because the registration period has ended',
          );
        });
      });
    });

    context('outside the registration period', () => {
      beforeEach(async () => {
        await time.increase(3600 * 240 + 1);
      });

      it('reverts', async () => {
        await expectRevert(
          policyProposals.registerProposal(testProposal.address),
          'no longer be registered',
        );
      });
    });
  });

  describe('support', () => {
    let policyProposals;
    let testProposal;
    let testProposal2;

    beforeEach(async () => {
      policyProposals = await makeProposals();
      testProposal = await Empty.new(1);
      testProposal2 = await Empty.new(1);

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER(),
      );

      await policyProposals.registerProposal(testProposal.address);

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER(),
      );

      await policyProposals.registerProposal(testProposal2.address);
    });

    context('after the registration period', () => {
      beforeEach(async () => {
        await time.increase(3600 * 240 + 1);
      });

      it('reverts', async () => {
        await expectRevert(
          policyProposals.support(testProposal.address),
          'Proposals may no longer be supported because the registration period has ended',
        );
      });
    });

    context('during the staking period', () => {
      it('allows staking once', async () => {
        const tx = await policyProposals.support(testProposal.address);
        await expectEvent.inTransaction(
          tx.tx,
          policyProposals.constructor,
          'ProposalSupported',
          { supporter: alice, proposalAddress: testProposal.address },
        );
      });

      it('adds the correct stake amount', async () => {
        const preSupportStake = toBN(
          (await policyProposals.proposals(testProposal.address))[2],
        );

        await policyProposals.support(testProposal.address);

        const postSupportStake = toBN(
          (await policyProposals.proposals(testProposal.address))[2],
        );

        expect(postSupportStake).to.eq.BN(
          toBN(10).pow(toBN(18)).muln(5000).add(preSupportStake),
        );
      });

      it('has the correct data in allProposalData', async () => {
        await policyProposals.support(testProposal.address, { from: alice });
        await policyProposals.support(testProposal2.address, { from: bob });

        const proposal1 = await policyProposals.proposals(testProposal.address);
        const proposal2 = await policyProposals.proposals(testProposal2.address);

        const proposalData = await policyProposals.allProposalData();

        expect(proposal1[0]).to.equal(proposalData[0][0]);
        expect(proposal1[1]).to.equal(proposalData[0][1]);
        expect(proposal1[2]).to.eq.BN(proposalData[0][2]);
        expect(proposal2[0]).to.equal(proposalData[1][0]);
        expect(proposal2[1]).to.equal(proposalData[1][1]);
        expect(proposal2[2]).to.eq.BN(proposalData[1][2]);
      });

      it('does not allow staking twice', async () => {
        await policyProposals.support(testProposal.address);
        await expectRevert(
          policyProposals.support(testProposal.address),
          'You may not stake in support of a proposal twice',
        );
      });

      it('can still stake for multiple proposals', async () => {
        await policyProposals.support(testProposal.address);
        await policyProposals.support(testProposal2.address);
      });

      context('when the staker has no funds', () => {
        it('reverts', async () => {
          await expectRevert(
            policyProposals.support(
              testProposal.address,
              { from: dave },
            ),
            'must stake a non-zero amount',
          );
        });
      });

      context('when supporting a non-existent proposal', () => {
        it('reverts', async () => {
          await expectRevert(
            policyProposals.support(constants.ZERO_ADDRESS),
            'proposal is not registered',
          );
        });
      });
    });

    context('after the staking period', () => {
      beforeEach(async () => {
        await time.increase(3600 * 1000 + 1);
      });

      it('does not allow staking', async () => {
        await expectRevert(
          policyProposals.support(testProposal.address),
          'registration period has ended',
        );
      });
    });
  });

  describe('unsupport', () => {
    let policyProposals;
    let testProposal;
    let testProposal2;

    beforeEach(async () => {
      policyProposals = await makeProposals();
      testProposal = await Empty.new(1);
      testProposal2 = await Empty.new(1);

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER(),
      );

      await policyProposals.registerProposal(testProposal.address);

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER(),
      );

      await policyProposals.registerProposal(testProposal2.address);

      await policyProposals.support(testProposal.address);
    });

    context('after the registration period', () => {
      beforeEach(async () => {
        await time.increase(3600 * 240 + 1);
      });

      it('reverts', async () => {
        await expectRevert(
          policyProposals.unsupport(testProposal.address),
          'Proposals may no longer be supported because the registration period has ended',
        );
      });
    });

    context('when unsupporting an unsupported proposal', () => {
      it('reverts', async () => {
        await expectRevert(
          policyProposals.unsupport(testProposal2.address),
          'You have not staked this proposal',
        );
      });
    });

    context('during the staking period', () => {
      it('allows unstaking', async () => {
        const tx = await policyProposals.unsupport(testProposal.address);
        await expectEvent.inTransaction(
          tx.tx,
          policyProposals.constructor,
          'ProposalUnsupported',
          { unsupporter: alice, proposalAddress: testProposal.address },
        );
      });

      it('subtracts the correct stake amount', async () => {
        const preUnsupportStake = toBN(
          (await policyProposals.proposals(testProposal.address))[2],
        );

        await policyProposals.unsupport(testProposal.address);

        const postUnsupportStake = toBN(
          (await policyProposals.proposals(testProposal.address))[2],
        );

        expect(postUnsupportStake).to.eq.BN(
          preUnsupportStake.sub(toBN(10).pow(toBN(18)).muln(5000)),
        );
      });

      it('can be indicisive if you want', async () => {
        await policyProposals.unsupport(testProposal.address);
        await policyProposals.support(testProposal.address);
        await policyProposals.unsupport(testProposal.address);
        await policyProposals.support(testProposal.address);
        await policyProposals.unsupport(testProposal.address);
        await policyProposals.support(testProposal.address);
        await policyProposals.unsupport(testProposal.address);
        await policyProposals.support(testProposal.address);

        const supportedStake = toBN(
          (await policyProposals.proposals(testProposal.address))[2],
        );

        expect(supportedStake).to.eq.BN(toBN(10).pow(toBN(18)).muln(5000));
      });
    });
  });

  describe('deployProposalVoting', () => {
    let policyProposals;
    let testProposal;

    it('reverts if proposal not selected', async () => {
      policyProposals = await makeProposals();
      testProposal = await Empty.new(1);

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER(),
      );

      await policyProposals.registerProposal(testProposal.address);

      await expectRevert(
        policyProposals.deployProposalVoting({ from: alice }),
        'no proposal has been selected',
      );
    });
  });

  describe('success', () => {
    let policyProposals;
    let testProposal;

    beforeEach(async () => {
      policyProposals = await makeProposals();
      testProposal = await Empty.new(1);

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER(),
      );

      await policyProposals.registerProposal(testProposal.address);
      await policyProposals.support(testProposal.address);
    });

    context('when still holds the policy role and proposals made', () => {
      it('emits the VotingStarted event', async () => {
        await policyProposals.support(testProposal.address, { from: charlie });
        const result = await policyProposals.deployProposalVoting();

        await expectEvent.inTransaction(
          result.tx,
          policyProposals.constructor,
          'VotingStarted',
        );
      });

      it('rejects support if proposal is chosen', async () => {
        await policyProposals.support(testProposal.address, { from: charlie });

        await expectRevert(
          policyProposals.support(testProposal.address),
          'A proposal has already been selected',
        );
      });

      it('rejects unsupport if proposal is chosen', async () => {
        await policyProposals.support(testProposal.address, { from: charlie });

        await expectRevert(
          policyProposals.unsupport(testProposal.address),
          'A proposal has already been selected',
        );
      });

      it('rejects support if deployed', async () => {
        await policyProposals.support(testProposal.address, { from: charlie });
        await policyProposals.deployProposalVoting();

        await expectRevert(
          policyProposals.support(testProposal.address),
          'A proposal has already been selected',
        );
      });

      it('deletes proposalToConfigure', async () => {
        await policyProposals.support(testProposal.address, { from: charlie });
        const proposalToConfigure = await policyProposals.proposalToConfigure();

        await policyProposals.deployProposalVoting();
        const zeroAddress = await policyProposals.proposalToConfigure();

        expect(proposalToConfigure).to.not.equal(zeroAddress);
        expect(zeroAddress).to.equal(ZERO_ADDRESS);
      });

      it('cannot double deploy', async () => {
        await policyProposals.support(testProposal.address, { from: charlie });
        await policyProposals.deployProposalVoting();

        await expectRevert(
          policyProposals.deployProposalVoting(),
          'voting has already been deployed',
        );
      });
    });

    context('when no longer the policy role', () => {
      beforeEach(async () => {
        await policy.testDirectSet('PolicyProposals', constants.ZERO_ADDRESS);
      });

      it('rejects support', async () => {
        await expectRevert(
          policyProposals.support(testProposal.address),
          'Proposal contract no longer active',
        );
      });

      it('rejects unsupport', async () => {
        await expectRevert(
          policyProposals.unsupport(testProposal.address),
          'Proposal contract no longer active',
        );
      });
    });
  });

  describe('refund', () => {
    let policyProposals;
    let testProposal;
    let testProposal2;
    beforeEach(async () => {
      policyProposals = await makeProposals();
      testProposal = await Empty.new(1);
      testProposal2 = await Empty.new(2);

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER(),
      );

      await policyProposals.registerProposal(testProposal.address);

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER(),
      );

      await policyProposals.registerProposal(testProposal2.address);
    });

    context('before results are computed', () => {
      it('reverts', async () => {
        await expectRevert(
          policyProposals.refund(testProposal.address),
          'may not be distributed until the period is over',
        );
      });
    });

    context('when a policy is selected', () => {
      beforeEach(async () => {
        await policyProposals.support(testProposal.address, { from: alice });
        await policyProposals.support(testProposal2.address, { from: charlie });
        await policyProposals.deployProposalVoting({ from: charlie });
      });

      it('tries to refund selected policy, reverts', async () => {
        await expectRevert(
          policyProposals.refund(testProposal2.address),
          'The provided proposal address is not valid',
        );
      });

      it('tries to refund non-selected policy, succeeds', async () => {
        const tx = await policyProposals.refund(testProposal.address);
        await expectEvent.inTransaction(
          tx.tx,
          policyProposals.constructor,
          'ProposalRefunded',
          { proposer: alice },
        );
      });
    });

    context('when the policy is not selected', () => {
      beforeEach(async () => {
        await time.increase(3600 * 240 + 1);
      });

      it('reverts', async () => {
        await expectRevert(
          policyProposals.refund('0x0000000000000000000000000000000000000000'),
          'The proposal address can\'t be 0',
        );
      });

      it('succeeds', async () => {
        const tx = await policyProposals.refund(testProposal.address);
        await expectEvent.inTransaction(
          tx.tx,
          policyProposals.constructor,
          'ProposalRefunded',
          { proposer: alice },
        );
      });

      // it('fails', async () => {
      //   // need to cover the branch where the refund fails for 100% coverage
      // });

      it('transfers the refund tokens', async () => {
        const refundAmount = toBN(await policyProposals.REFUND_IF_LOST());
        const preRefundBalance = toBN(
          await eco.balanceOf(alice),
        );

        await policyProposals.refund(testProposal.address);

        assert(
          toBN(await eco.balanceOf(alice))
            .sub(preRefundBalance)
            .eq(refundAmount),
        );
      });
    });
  });

  describe('destruct', () => {
    let policyProposals;
    let testProposal;
    let testProposal2;

    context('on the implementation contract itself', () => {
      beforeEach(async () => {
        const policySetter = await SimplePolicySetter.new();
        policyProposals = await PolicyProposals.new(
          policy.address,
          (await PolicyVotes.new(policy.address)).address,
          policySetter.address,
        );
      });
    });

    context('before results are computed', () => {
      beforeEach(async () => {
        policyProposals = await makeProposals();
      });

      it('reverts', async () => {
        await expectRevert(
          policyProposals.destruct(),
          'can only be performed when the period is over',
        );
      });
    });

    context('after results are computed and proposals are refunded', () => {
      beforeEach(async () => {
        policyProposals = await makeProposals();
        testProposal = await Empty.new(1);
        testProposal2 = await Empty.new(2);

        await eco.approve(
          policyProposals.address,
          await policyProposals.COST_REGISTER(),
        );

        await policyProposals.registerProposal(testProposal.address);
      });

      it('succeeds if proposal window has ended', async () => {
        await policyProposals.support(testProposal.address);
        await time.increase(3600 * 240 + 1);
        await policyProposals.refund(testProposal.address);

        const balancePPBefore = await eco.balanceOf(policyProposals.address);
        const balancePolicyBefore = await eco.balanceOf(policy.address);
        await policyProposals.destruct();
        const balancePPAfter = await eco.balanceOf(policyProposals.address);
        const balancePolicyAfter = await eco.balanceOf(policy.address);
        expect(balancePolicyAfter.toString()
               === toBN(balancePolicyBefore + balancePPBefore).toString());
        expect(balancePPAfter.toNumber() === 0);
      });

      it('succeeds if proposal selected ahead of time', async () => {
        await eco.approve(
          policyProposals.address,
          await policyProposals.COST_REGISTER(),
        );

        await policyProposals.registerProposal(testProposal2.address);

        const charlieBalance = eco.balanceOf(charlie);

        await policyProposals.support(testProposal.address);
        await policyProposals.support(testProposal2.address, { from: charlie });
        await policyProposals.deployProposalVoting({ from: charlie });

        await policyProposals.refund(testProposal.address);

        await policyProposals.destruct();

        const balancePPAfter = await eco.balanceOf(policyProposals.address);
        expect(balancePPAfter.toNumber() === charlieBalance);
      });
    });

    context('after results are computed with proposals not refunded', () => {
      beforeEach(async () => {
        policyProposals = await makeProposals();
        testProposal = await Empty.new(1);

        await eco.approve(
          policyProposals.address,
          await policyProposals.COST_REGISTER(),
        );

        await policyProposals.registerProposal(testProposal.address);
        await policyProposals.support(testProposal.address);

        await time.increase(3600 * 240 + 1);
      });

      it('reverts', async () => {
        await expectRevert(
          policyProposals.destruct(),
          'refund all missed proposals',
        );
      });
    });
  });
});
