/*
 * This is an end-to-end demo of policy votes to upgrade a ForwardTarget proxy
 * The TrustedNodes contract is used as an example as it has long lasting data to be proserved
 *
 * Note that this 'test' shares states between the it() functions, and
 * it() is used mostly to break up the logical steps.
 *
 * The purpose of this demo is to propose a policy change that alters the
 * trustee managing contract to add a checkable property to show that the upgrade has been made
 * This kind of proxy upgrade does not change the address stored in the policy.
 */

const chai = require('chai');

const { expect } = chai;

const PolicyProposals = artifacts.require('PolicyProposals');
const PolicyVotes = artifacts.require('PolicyVotes');
const ImplementationUpdatingTarget = artifacts.require('ImplementationUpdatingTarget');
const MakeTrustedPoodles = artifacts.require('MakeTrustedPoodles');
const PoodleTrustedNodes = artifacts.require('PoodleTrustedNodes');

const {
  expectRevert,
  time,
} = require('@openzeppelin/test-helpers');

const util = require('../../tools/test/util');
const { isCoverage } = require('../../tools/test/coverage');

const { toBN } = web3.utils;

contract('Proxy Policy Change [@group=9]', (accounts) => {
  let policy;
  let eco;
  let timedPolicies;
  let policyProposals;
  let policyVotes;
  let initInflation;

  let implementationUpdatingTarget;
  let makeTrustedPoodles;
  let poodleTrustedNodes;
  let poodleCheck;

  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];
  const dave = accounts[3];
  let counter = 0;
  const trustednodes = [bob, charlie, dave];

  it('Deploys the production system', async () => {
    ({
      policy,
      eco,
      initInflation,
      timedPolicies,
    } = await util.deployPolicy(accounts[counter], { trustednodes }));
    counter += 1;
  });

  it('Stakes accounts', async () => {
    const stake = toBN(10).pow(toBN(18)).muln(5000);
    /* Until we have some idea how initial distribution is done, this *does* use
     *a test-function
     */
    await initInflation.mint(eco.address, alice, stake);
    await initInflation.mint(eco.address, bob, stake);
    await initInflation.mint(eco.address, charlie, stake);
    await initInflation.mint(eco.address, dave, stake);
  });

  it('Waits a generation', async () => {
    await time.increase(3600 * 24 * 40);
    await timedPolicies.incrementGeneration();
  });

  it('Checks that the current trusted nodes contract is not poodles', async () => {
    poodleCheck = await PoodleTrustedNodes.at(
      await util.policyFor(policy, await timedPolicies.ID_TRUSTED_NODES()),
    );
    // the contract at ID_TRUSTED_NODES is not poodles so it does not have this function
    await expectRevert.unspecified(
      poodleCheck.provePoodles(),
    );
  });

  it('Checks that the current trusted nodes contract has data', async () => {
    const numTrustees = await poodleCheck.numTrustees();

    expect(numTrustees.toNumber()).to.equal(trustednodes.length);
  });

  it('Constructs the proposals', async () => {
    poodleTrustedNodes = await PoodleTrustedNodes.new();
    implementationUpdatingTarget = await ImplementationUpdatingTarget.new();
    makeTrustedPoodles = await MakeTrustedPoodles.new(
      poodleTrustedNodes.address,
      implementationUpdatingTarget.address,
    );
    const name = await makeTrustedPoodles.name();
    expect(name).to.equal('MakeTrustedPoodles');
  });

  it('Checks that the 820 workaround for coverage is correct', async () => {
    /* When running in coverage mode, policyFor returns the tx object instead of
     * return data
     */
    const ecoHash = web3.utils.soliditySha3('ECO');
    const pf = await policy.policyFor(ecoHash);
    const erc = await util.policyFor(policy, ecoHash);
    if (await isCoverage()) {
      return;
    }
    assert.equal(erc, pf);
  });

  it('Kicks off a proposal round', async () => {
    const proposalsHash = web3.utils.soliditySha3('PolicyProposals');
    policyProposals = await PolicyProposals.at(
      await util.policyFor(policy, proposalsHash),
    );
  });

  it('Accepts new proposals', async () => {
    await eco.approve(
      policyProposals.address,
      await policyProposals.COST_REGISTER(),
      { from: alice },
    );
    await policyProposals.registerProposal(makeTrustedPoodles.address, {
      from: alice,
    });

    await time.increase(3600 * 24 * 2);
  });

  it('Adds stake to proposals to ensure they are in the top 10', async () => {
    await policyProposals.support(makeTrustedPoodles.address, { from: alice });
    await policyProposals.support(makeTrustedPoodles.address, { from: bob });
    await policyProposals.deployProposalVoting({ from: bob });
  });

  it('Transitions from proposing to voting', async () => {
    const policyVotesIdentifierHash = web3.utils.soliditySha3('PolicyVotes');
    policyVotes = await PolicyVotes.at(
      await util.policyFor(policy, policyVotesIdentifierHash),
    );
  });

  it('Allows all users to vote', async () => {
    await policyVotes.vote(
      true,
      { from: alice },
    );
    await policyVotes.vote(
      true,
      { from: bob },
    );
  });

  it('Waits another week (end of commit period)', async () => {
    await time.increase(3600 * 24 * 7);
  });

  it('Executes the outcome of the votes', async () => {
    await policyVotes.execute();
  });

  it('Moves to the next generation', async () => {
    await time.increase(3600 * 24 * 7);
    await timedPolicies.incrementGeneration();
  });

  it('Checks that the address has not changed', async () => {
    const trustNodesHash = await timedPolicies.ID_TRUSTED_NODES();
    const retryPoodleCheckAddress = await util.policyFor(policy, trustNodesHash);
    expect(retryPoodleCheckAddress).to.equal(poodleCheck.address);
  });

  it('Checks that the new trustee contract is poodles', async () => {
    const poodles = await poodleCheck.provePoodles();
    expect(poodles).to.be.true;
  });

  it('Checks that the new trustee contract retains all old data', async () => {
    const poodleTrustees = await poodleCheck.numTrustees();
    expect(poodleTrustees.toNumber()).to.equal(trustednodes.length);

    for (let i = 0; i < trustednodes.length; i++) {
      /* eslint-disable no-await-in-loop */
      expect(await poodleCheck.isTrusted(trustednodes[i])).to.be.true;
    }
  });
});
