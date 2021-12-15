/*
 * This is an end-to-end test of trustee voting to change the trustee list
 *
 * Note that this 'test' shares states between the it() functions, and
 * it() is used mostly to break up the logical steps.
 *
 * The purpose of this test is to show how a single trustee can be replaced,
 * how a full suite of trustees can be replaces, and how a new TrustedNodes
 * contract can replace the old one.
 */

const chai = require('chai');
const {
  time,
} = require('@openzeppelin/test-helpers');
const util = require('../../tools/test/util');

const PolicyProposals = artifacts.require('PolicyProposals');
const PolicyVotes = artifacts.require('PolicyVotes');
const SingleTrusteeReplacement = artifacts.require('SingleTrusteeReplacement');

const { toBN } = web3.utils;
const { expect } = chai;

contract('Governance Trustee Change [@group=9]', ([alice, bob, charlie, dave]) => {
  let policy;
  let balanceStore;
  let token;
  let timedPolicies;
  let policyProposals;
  let policyVotes;
  let initInflation;
  let trustedNodes;
  let singleTrusteeReplacement;

  it('Deploys the production system', async () => {
    ({
      policy,
      balanceStore,
      token,
      initInflation,
      timedPolicies,
      trustedNodes,
    } = await util.deployPolicy({ trustees: [bob, charlie, dave] }));
  });

  it('Stakes accounts', async () => {
    const stake = toBN(10).pow(toBN(18)).muln(5000);
    /* Until we have some idea how initial distribution is done, this *does* use
     *a test-function
     */
    await initInflation.mint(balanceStore.address, alice, stake);
    await initInflation.mint(balanceStore.address, bob, stake);
    await initInflation.mint(balanceStore.address, charlie, stake);
    await initInflation.mint(balanceStore.address, dave, stake);
  });

  it('Waits a generation', async () => {
    await time.increase(3600 * 24 * 40);
    await timedPolicies.incrementGeneration();
  });

  it('Constructs the proposals', async () => {
    singleTrusteeReplacement = await SingleTrusteeReplacement.new(
      bob,
      alice,
      { from: alice },
    );
    const name = await singleTrusteeReplacement.name();
    expect(name).to.equal('Trustee Replacement Proposal Template');
    expect(await singleTrusteeReplacement.oldTrustee()).to.equal(bob);
    expect(await singleTrusteeReplacement.newTrustee()).to.equal(alice);
  });

  it('Checks that bob initially a trustee', async () => {
    const bobBool = await trustedNodes.isTrusted(bob);
    // console.log(bobBool);
    expect(bobBool).to.be.true;
  });

  it('Checks that charlie initially a trustee', async () => {
    const charlieBool = await trustedNodes.isTrusted(charlie);
    // console.log(charlieBool);
    expect(charlieBool).to.be.true;
  });

  it('Checks that dave initially a trustee', async () => {
    const daveBool = await trustedNodes.isTrusted(dave);
    // console.log(daveBool);
    expect(daveBool).to.be.true;
  });

  it('Checks that alice is not yet a trustee', async () => {
    const aliceBool = await trustedNodes.isTrusted(alice);
    // console.log(aliceBool);
    expect(aliceBool).to.be.false;
  });

  it('Kicks off a proposal round', async () => {
    const proposalsHash = web3.utils.soliditySha3('PolicyProposals');
    policyProposals = await PolicyProposals.at(
      await util.policyFor(policy, proposalsHash),
    );
  });

  it('Accepts new proposals', async () => {
    await token.approve(
      policyProposals.address,
      await policyProposals.COST_REGISTER(),
      { from: alice },
    );
    await policyProposals.registerProposal(singleTrusteeReplacement.address, {
      from: alice,
    });

    await time.increase(3600 * 24 * 2);
  });

  it('Adds stake to proposals to ensure thati it goes to a vote', async () => {
    await policyProposals.support(singleTrusteeReplacement.address, { from: alice });
    await policyProposals.support(singleTrusteeReplacement.address, { from: bob });
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

  it('Checks that bob is no longer a trustee', async () => {
    const bobBool = await trustedNodes.isTrusted(bob);
    // console.log(bobBool);
    expect(bobBool).to.be.false;
  });

  it('Checks that charlie is still a trustee', async () => {
    const charlieBool = await trustedNodes.isTrusted(charlie);
    // console.log(charlieBool);
    expect(charlieBool).to.be.true;
  });

  it('Checks that dave is still a trustee', async () => {
    const daveBool = await trustedNodes.isTrusted(dave);
    // console.log(daveBool);
    expect(daveBool).to.be.true;
  });

  it('Checks that alice is now a trustee', async () => {
    const aliceBool = await trustedNodes.isTrusted(alice);
    // console.log(aliceBool);
    expect(aliceBool).to.be.true;
  });
});
