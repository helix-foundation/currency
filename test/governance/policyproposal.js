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

const util = require('../../tools/test/util');

const { BN, toBN } = web3.utils;
chai.use(bnChai(BN));

contract('PolicyProposals [@group=7]', ([alice, bob, charlie, dave]) => {
  let policy;
  let token;
  let balanceStore;
  let initInflation;
  let timedPolicies;

  beforeEach(async () => {
    ({
      policy,
      balanceStore,
      token,
      initInflation,
      timedPolicies,
    } = await util.deployPolicy());

    await initInflation.mint(balanceStore.address, alice, toBN(10).pow(toBN(18)).muln(5000));
    await initInflation.mint(balanceStore.address, bob, toBN(10).pow(toBN(18)).muln(5000));
    await initInflation.mint(balanceStore.address, charlie, toBN(10).pow(toBN(18)).muln(10000));
    await time.increase(3600 * 24 * 40);
    await timedPolicies.incrementGeneration();
    await balanceStore.update(alice);
    await balanceStore.update(bob);
    await balanceStore.update(charlie);
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

    beforeEach(async () => {
      policyProposals = await makeProposals();
      testProposal = await Empty.new(1);
    });

    context('during the registration period', () => {
      context('when the fee is not approved', () => {
        it('cannot register a proposal', async () => {
          await expectRevert(
            policyProposals.registerProposal(testProposal.address),
            'Insufficient allowance for transfer',
          );
        });
      });

      context('when the fee is pre-approved', () => {
        beforeEach(async () => {
          await token.approve(
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
          await token.approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER(),
          );

          await policyProposals.registerProposal(testProposal.address);

          await token.approve(
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
    });

    context('outside the registration period', () => {
      beforeEach(async () => {
        await time.increase(3600 * 96 + 1);
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

      await token.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER(),
      );

      await policyProposals.registerProposal(testProposal.address);

      await token.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER(),
      );

      await policyProposals.registerProposal(testProposal2.address);
    });

    context('after the registration period', () => {
      beforeEach(async () => {
        await time.increase(3600 * 96 + 1);
      });

      it('reverts', async () => {
        await expectRevert(
          policyProposals.support(testProposal.address, []),
          'Proposals may no longer be supported because the registration period has ended',
        );
      });
    });

    context('during the staking period', () => {
      it('allows staking once', async () => {
        const tx = await policyProposals.support(testProposal.address, []);
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

        await policyProposals.support(testProposal.address, []);

        const postSupportStake = toBN(
          (await policyProposals.proposals(testProposal.address))[2],
        );

        expect(postSupportStake).to.eq.BN(
          toBN(10).pow(toBN(18)).muln(5000).add(preSupportStake),
        );
      });

      it('does not allow staking twice', async () => {
        await policyProposals.support(testProposal.address, []);
        await expectRevert(
          policyProposals.support(testProposal.address, []),
          'may not stake in support of a proposal if you have already staked',
        );
      });

      it('can still stake for multiple proposals', async () => {
        await policyProposals.support(testProposal.address, []);
        await policyProposals.support(testProposal2.address, []);
      });

      context('when the staker has no funds', () => {
        it('reverts', async () => {
          await expectRevert(
            policyProposals.support(
              testProposal.address, [],
              { from: dave },
            ),
            'must stake a non-zero amount',
          );
        });
      });

      context('when supporting a non-existent proposal', () => {
        it('reverts', async () => {
          await expectRevert(
            policyProposals.support(constants.ZERO_ADDRESS, []),
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
          policyProposals.support(testProposal.address, []),
          'registration period has ended',
        );
      });
    });
  });

  describe('success', () => {
    let policyProposals;
    let testProposal;

    beforeEach(async () => {
      policyProposals = await makeProposals();
      testProposal = await Empty.new(1);

      await token.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER(),
      );

      await policyProposals.registerProposal(testProposal.address);
      await policyProposals.support(testProposal.address, []);
    });

    context('when still holds the policy role and proposals made', () => {
      it('emits the VotingStarted event', async () => {
        const result = await policyProposals.support(testProposal.address, [], { from: charlie });

        await expectEvent.inTransaction(
          result.tx,
          policyProposals.constructor,
          'VotingStarted',
        );
      });

      it('gives up the PolicyProposals role', async () => {
        await policyProposals.support(testProposal.address, [], { from: charlie });

        assert.notEqual(
          await util.policyFor(
            policy,
            web3.utils.soliditySha3('PolicyProposals'),
          ),
          policyProposals.address,
        );
      });
    });

    context('when no longer the policy role', () => {
      beforeEach(async () => {
        await policy.testDirectSet('PolicyProposals', constants.ZERO_ADDRESS);
      });

      it('rejects support', async () => {
        await expectRevert(
          policyProposals.support(testProposal.address, []),
          'no longer active',
        );
      });
    });
  });

  describe('refund', () => {
    let policyProposals;
    let testProposal;

    beforeEach(async () => {
      policyProposals = await makeProposals();
      testProposal = await Empty.new(1);

      await token.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER(),
      );

      await policyProposals.registerProposal(testProposal.address);
    });

    context('before results are computed', () => {
      it('reverts', async () => {
        await expectRevert(
          policyProposals.refund(testProposal.address),
          'may not be distributed until results have been computed',
        );
      });
    });

    context('when the policy is selected', () => {
      beforeEach(async () => {
        await policyProposals.support(testProposal.address, [], { from: charlie });
        await time.increase(3600 * 96 + 1);
      });

      it('reverts', async () => {
        await expectRevert(
          policyProposals.refund(testProposal.address),
          'proposal address is not valid',
        );
      });
    });

    context('when the policy is not selected', () => {
      beforeEach(async () => {
        await time.increase(3600 * 96 + 1);
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
          await token.balanceOf(alice),
        );

        await policyProposals.refund(testProposal.address);

        assert(
          toBN(await token.balanceOf(alice))
            .sub(preRefundBalance)
            .eq(refundAmount),
        );
      });
    });
  });

  describe('destruct', () => {
    let policyProposals;
    let testProposal;

    context('on the implementation contract itself', () => {
      beforeEach(async () => {
        const policySetter = await SimplePolicySetter.new();
        policyProposals = await PolicyProposals.new(
          policy.address,
          (await PolicyVotes.new(policy.address)).address,
          policySetter.address,
        );
      });

      it('reverts', async () => {
        await expectRevert(
          policyProposals.destruct(),
          'This method can only be called on clones',
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
          'can only be performed after results have been computed',
        );
      });
    });

    context('after results are computed and proposals are refunded', () => {
      beforeEach(async () => {
        policyProposals = await makeProposals();
        testProposal = await Empty.new(1);

        await token.approve(
          policyProposals.address,
          await policyProposals.COST_REGISTER(),
        );

        await policyProposals.registerProposal(testProposal.address);
        await policyProposals.support(testProposal.address, []);

        await time.increase(3600 * 96 + 1);
        await policyProposals.refund(testProposal.address);
      });

      it('succeeds', async () => {
        const balancePPBefore = await token.balanceOf(policyProposals.address);
        const balancePolicyBefore = await token.balanceOf(policy.address);
        await policyProposals.destruct();
        const balancePPAfter = await token.balanceOf(policyProposals.address);
        const balancePolicyAfter = await token.balanceOf(policy.address);
        expect(balancePolicyAfter.toString()
               === toBN(balancePolicyBefore + balancePPBefore).toString());
        expect(balancePPAfter.toNumber() === 0);
      });
    });

    context('after results are computed with proposals not refunded', () => {
      beforeEach(async () => {
        policyProposals = await makeProposals();
        testProposal = await Empty.new(1);

        await token.approve(
          policyProposals.address,
          await policyProposals.COST_REGISTER(),
        );

        await policyProposals.registerProposal(testProposal.address);
        await policyProposals.support(testProposal.address, []);

        await time.increase(3600 * 96 + 1);
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
