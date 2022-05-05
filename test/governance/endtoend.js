/*
 * This is not a unit-test, it's an end-to-end demo of how policy votes
 * will work in production. This file should not include or use any
 * derived test-only contracts; the only helper is the manipulation of
 * time.
 *
 * Note that this 'test' shares states between the it() functions, and
 * it() is used mostly to break up the logical steps.
 *
 * The purpose of this demo is to propose 2 policy changes:
 * - Immediately Mint 1 000 000 Eco to accounts[3]
 * - Install a backdoor in the policy system
 *
 * Votes will be cast so both proposals end up on the ballot, but only
 * the first proposal will pass the final vote.
 */

const PolicyProposals = artifacts.require('PolicyProposals');
const PolicyVotes = artifacts.require('PolicyVotes');
const MakeRich = artifacts.require('MakeRich');
const MakeBackdoor = artifacts.require('MakeBackdoor');

const { time } = require('@openzeppelin/test-helpers');

const util = require('../../tools/test/util');
const { isCoverage } = require('../../tools/test/coverage');

const { toBN } = web3.utils;

contract('Production Policy Change [@group=4]', (accounts) => {
  let policy;
  let eco;
  let timedPolicies;
  let makerich;
  let backdoor;
  let policyProposals;
  let policyVotes;
  let initInflation;

  it('Deploys the production system', async () => {
    ({
      policy,
      eco,
      initInflation,
      timedPolicies,
    } = await util.deployPolicy(accounts[0]));
  });

  it('Stakes accounts', async () => {
    const stake = toBN(10).pow(toBN(18)).muln(5000);
    /* Until we have some idea how initial distribution is done, this *does* use
     *a test-function
     */
    await initInflation.mint(eco.address, accounts[1], stake);
    await initInflation.mint(eco.address, accounts[2], stake);
    await initInflation.mint(eco.address, accounts[3], stake);
    await initInflation.mint(eco.address, accounts[4], stake);
  });

  it('Waits a generation', async () => {
    await time.increase(3600 * 24 * 14 + 1);
    await timedPolicies.incrementGeneration();
  });

  it('Constructs the proposals', async () => {
    makerich = await MakeRich.new(accounts[5], 1000000, { from: accounts[1] });
    backdoor = await MakeBackdoor.new(accounts[2], { from: accounts[2] });
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
    //    await timedPolicies.incrementGeneration();
    policyProposals = await PolicyProposals.at(
      await util.policyFor(policy, proposalsHash),
    );
  });

  it('Accepts new proposals', async () => {
    await eco.approve(
      policyProposals.address,
      await policyProposals.COST_REGISTER(),
      { from: accounts[1] },
    );
    await policyProposals.registerProposal(makerich.address, {
      from: accounts[1],
    });

    await eco.approve(
      policyProposals.address,
      await policyProposals.COST_REGISTER(),
      { from: accounts[2] },
    );
    await policyProposals.registerProposal(backdoor.address, {
      from: accounts[2],
    });
  });

  it('Adds stake to proposals to ensure they are in the top 10', async () => {
    await policyProposals.support(makerich.address, { from: accounts[1] });

    await policyProposals.support(backdoor.address, { from: accounts[2] });
    await policyProposals.support(makerich.address, { from: accounts[2] });
    await policyProposals.deployProposalVoting({ from: accounts[1] });
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
      { from: accounts[1] },
    );
    await policyVotes.vote(
      true,
      { from: accounts[2] },
    );
  });

  it('Waits until the voting period ends', async () => {
    await time.increase(3600 * 24 * 4 + 1);
  });

  it('Executes the outcome of the votes', async () => {
    await policyVotes.execute();
  });

  it('Refunds the missed proposal', async () => {
    // 10 total days of waiting until the refunds can be accessed
    await time.increase(3600 * 24 * 6 + 1);
    await policyProposals.refund(backdoor.address);
  });

  it('Confirms the backdoor is not there', async () => {
    const backdoorHash = web3.utils.soliditySha3('Backdoor');
    assert.equal(await util.policyFor(policy, backdoorHash), 0);
  });

  it('Celebrates accounts[5]', async () => {
    assert.equal((await eco.balanceOf.call(accounts[5])).toString(), 1000000);
  });
});
