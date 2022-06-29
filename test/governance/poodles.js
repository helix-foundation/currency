/*
 * This is an end-to-end demo of policy votes to add functionality to
 * a governance contract.
 *
 * Note that this 'test' shares states between the it() functions, and
 * it() is used mostly to break up the logical steps.
 *
 * The purpose of this demo is to propose a policy change that alters
 * trustee voting to add an additional, functionless parameter
 * (the number of poodles at the current generation).
 */

const chai = require('chai');

const { expect } = chai;

const PolicyProposals = artifacts.require('PolicyProposals');
const PolicyVotes = artifacts.require('PolicyVotes');
const MakePoodle = artifacts.require('MakePoodle');
const PoodleCurrencyGovernance = artifacts.require('PoodleCurrencyGovernance');
const PoodleCurrencyTimer = artifacts.require('PoodleCurrencyTimer');
const {
  expectRevert,
  time,
} = require('@openzeppelin/test-helpers');

const util = require('../../tools/test/util');
const { isCoverage } = require('../../tools/test/coverage');

const { toBN } = web3.utils;

contract('Governance Policy Change [@group=9]', (accounts) => {
  let policy;
  let eco;
  let timedPolicies;
  let policyProposals;
  let policyVotes;
  let initInflation;

  let makePoodle;
  let poodleCurrencyGovernance;
  let poodleCurrencyTimer;
  let poodleBorda;

  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];
  const dave = accounts[3];
  let counter = 0;

  it('Deploys the production system', async () => {
    ({
      policy,
      eco,
      initInflation,
      timedPolicies,
    } = await util.deployPolicy(accounts[counter], { trustednodes: [bob, charlie, dave] }));
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

  it('Checks that the current governance contract is not poodles', async () => {
    poodleBorda = await PoodleCurrencyGovernance.at(
      await util.policyFor(policy, web3.utils.soliditySha3('CurrencyGovernance')),
    );
    // the contract at ID_CURRENCY_GOVERNANCE is not poodles so it does not have this function
    await expectRevert.unspecified(
      poodleBorda.provePoodles(),
    );
  });

  it('Constructs the proposals', async () => {
    poodleCurrencyGovernance = await PoodleCurrencyGovernance.new(policy.address);
    poodleCurrencyTimer = await PoodleCurrencyTimer.new();
    makePoodle = await MakePoodle.new(
      poodleCurrencyGovernance.address,
      poodleCurrencyTimer.address,
      { from: alice },
    );
    const name = await makePoodle.name();
    expect(name).to.equal('MakePoodle');
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
    await policyProposals.registerProposal(makePoodle.address, {
      from: alice,
    });

    await time.increase(3600 * 24 * 2);
  });

  it('Adds stake to proposals to ensure they are in the top 10', async () => {
    await policyProposals.support(makePoodle.address, { from: alice });
    await policyProposals.support(makePoodle.address, { from: bob });
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

  it('Checks that the new governance contract is poodles', async () => {
    poodleBorda = await PoodleCurrencyGovernance.at(
      await util.policyFor(policy, web3.utils.soliditySha3('CurrencyGovernance')),
    );
    const poodles = await poodleBorda.provePoodles();
    expect(poodles).to.be.true;
  });
});
