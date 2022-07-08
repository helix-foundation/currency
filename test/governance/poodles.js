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

const { expect } = require('chai');
const { ethers } = require('hardhat');
const { ecoFixture } = require('../utils/fixtures');
const time = require('../utils/time');
const { deploy } = require('../utils/contracts');
const util = require('../../tools/test/util');

describe('Governance Policy Change [@group=9]', () => {
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

  let alice;
  let bob;
  let charlie;
  let dave;

  it('Deploys the production system', async () => {
    const accounts = await ethers.getSigners();
    [alice, bob, charlie, dave] = accounts;
    ({
      policy,
      eco,
      faucet: initInflation,
      timedPolicies,
    } = await ecoFixture([
      await bob.getAddress(),
      await charlie.getAddress(),
      await dave.getAddress(),
    ]));
  });

  it('Stakes accounts', async () => {
    const stake = ethers.utils.parseEther('5000');
    /* Until we have some idea how initial distribution is done, this *does* use
     *a test-function
     */
    await initInflation.mint(await alice.getAddress(), stake);
    await initInflation.mint(await bob.getAddress(), stake);
    await initInflation.mint(await charlie.getAddress(), stake);
    await initInflation.mint(await dave.getAddress(), stake);
  });

  it('Waits a generation', async () => {
    await time.increase(3600 * 24 * 40);
    await timedPolicies.incrementGeneration();
  });

  it('Checks that the current governance contract is not poodles', async () => {
    poodleBorda = await ethers.getContractAt(
      'PoodleCurrencyGovernance',
      await util.policyFor(policy, web3.utils.soliditySha3('CurrencyGovernance')),
    );
    // the contract at ID_CURRENCY_GOVERNANCE is not poodles so it does not have this function
    await expect(poodleBorda.provePoodles()).to.be.reverted;
  });

  it('Constructs the proposals', async () => {
    poodleCurrencyGovernance = await deploy('PoodleCurrencyGovernance', policy.address);
    poodleCurrencyTimer = await deploy('PoodleCurrencyTimer');
    makePoodle = await deploy(
      'MakePoodle',
      poodleCurrencyGovernance.address,
      poodleCurrencyTimer.address,
    );
    const name = await makePoodle.name();
    expect(name).to.equal('MakePoodle');
  });

  it('Checks that the 820 workaround for coverage is correct [ @skip-on-coverage ]', async () => {
    /* When running in coverage mode, policyFor returns the tx object instead of
     * return data
     */
    const ecoHash = web3.utils.soliditySha3('ECO');
    const pf = await policy.policyFor(ecoHash);
    const erc = await util.policyFor(policy, ecoHash);
    assert.equal(erc, pf);
  });

  it('Kicks off a proposal round', async () => {
    const proposalsHash = web3.utils.soliditySha3('PolicyProposals');
    policyProposals = await ethers.getContractAt(
      'PolicyProposals',
      await util.policyFor(policy, proposalsHash),
    );
  });

  it('Accepts new proposals', async () => {
    await eco
      .connect(alice)
      .approve(policyProposals.address, await policyProposals.COST_REGISTER());
    await policyProposals.connect(alice).registerProposal(makePoodle.address);

    await time.increase(3600 * 24 * 2);
  });

  it('Adds stake to proposals to ensure they are in the top 10', async () => {
    await policyProposals.connect(alice).support(makePoodle.address);
    await policyProposals.connect(bob).support(makePoodle.address);
    await policyProposals.connect(bob).deployProposalVoting();
  });

  it('Transitions from proposing to voting', async () => {
    const policyVotesIdentifierHash = web3.utils.soliditySha3('PolicyVotes');
    policyVotes = await ethers.getContractAt(
      'PolicyVotes',
      await util.policyFor(policy, policyVotesIdentifierHash),
    );
  });

  it('Allows all users to vote', async () => {
    await policyVotes.connect(alice).vote(true);
    await policyVotes.connect(bob).vote(true);
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
    poodleBorda = await ethers.getContractAt(
      'PoodleCurrencyGovernance',
      await util.policyFor(policy, web3.utils.soliditySha3('CurrencyGovernance')),
    );
    const poodles = await poodleBorda.provePoodles();
    expect(poodles).to.be.true;
  });
});
