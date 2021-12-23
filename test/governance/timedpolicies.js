const PolicyProposals = artifacts.require('PolicyProposals');
const ForwardProxy = artifacts.require('ForwardProxy');
const {
  expectEvent, time,
} = require('@openzeppelin/test-helpers');
const util = require('../../tools/test/util');

contract('TimedPolicies [@group=12]', (accounts) => {
  let policy;
  let timedPolicies;

  let count = 0;

  beforeEach(async () => {
    ({
      policy,
      timedPolicies,
    } = await util.deployPolicy(accounts[count]));
    count += 1;
  });

  it('Should do a simple voting cycle', async () => {
    const policyVotesIdentifierHash = web3.utils.soliditySha3('PolicyVotes');
    const policyProposalsIdentifierHash = web3.utils.soliditySha3(
      'PolicyProposals',
    );

    assert.equal(await util.policyFor(policy, policyVotesIdentifierHash), 0);

    assert.notEqual(
      await util.policyFor(policy, policyProposalsIdentifierHash),
      0,
    );

    const policyProposals = await PolicyProposals.at(
      await util.policyFor(policy, policyProposalsIdentifierHash),
    );
    await time.increase(3600 * 24 * 15);

    assert.equal(await util.policyFor(policy, policyVotesIdentifierHash), 0);

    await policyProposals.destruct();
    assert.equal(
      await util.policyFor(policy, policyProposalsIdentifierHash),
      0,
    );
  });

  describe('initialize', () => {
    it('can be proxied', async () => {
      await ForwardProxy.new(timedPolicies.address);
    });
  });

  describe('startPolicyProposal', () => {
    context("when it's time to start a new cycle", () => {
      it('emits a PolicyDecisionStarted event', async () => {
        await time.increase(3600 * 24 * 15);
        const tx = await timedPolicies.incrementGeneration();
        await expectEvent.inTransaction(
          tx.tx,
          timedPolicies.constructor,
          'PolicyDecisionStarted',
        );
      });
    });
  });
});
