/* eslint no-await-in-loop: "off" */
/* eslint-disable no-underscore-dangle */

/*
 * This is not a unit-test, it's just a tool to exercise the process
 * supervisor and ensure the process supervisor does 'something' for
 * most states.
 *
 * For a cleaner demo, look at endtoend.js
 */

const PolicyProposals = artifacts.require('PolicyProposals');
const PolicyVotes = artifacts.require('PolicyVotes');
const MakeRich = artifacts.require('MakeRich');
const MakeBackdoor = artifacts.require('MakeBackdoor');
const CurrencyGovernance = artifacts.require('CurrencyGovernance');
const InflationRootHashProposal = artifacts.require('InflationRootHashProposal');
const Lockup = artifacts.require('Lockup');

const { time } = require('@openzeppelin/test-helpers');
const chai = require('chai');
const bnChai = require('bn-chai');

const { assert, expect } = chai;

const { awaitAllVDFEnded } = require('../../tools/utils');
const util = require('../../tools/test/util.js');

const { Supervisor } = require('../../tools/supervisor.js');

const { BN, toBN } = web3.utils;
chai.use(bnChai(BN));

contract('Production Supervisor', (accounts) => {
  const policyProposalsIdentifierHash = web3.utils.soliditySha3(
    'PolicyProposals',
  );
  const policyVotesIdentifierHash = web3.utils.soliditySha3('PolicyVotes');
  const governanceHash = web3.utils.soliditySha3('CurrencyGovernance');

  let policy;
  let balanceStore;
  let token;
  let makerich;
  let makerich2;
  let backdoor;
  let policyProposals;
  let policyVotes;
  let initInflation;
  let supervisor;
  let governance;
  let currencyTimer;

  it('Deploys the production system', async () => {
    ({
      policy,
      balanceStore,
      token,
      initInflation,
      currencyTimer,
    } = await util.deployPolicy({ trustees: accounts.slice(1, 5) }));
  });

  it('Creates the supervisor', async () => {
    const supervisorStash = toBN(10).pow(toBN(18)).muln(5000000);
    await initInflation.mint(balanceStore.address, accounts[0], supervisorStash);
    supervisor = new Supervisor(policy.address, accounts[0]);
  });

  it('Stakes accounts', async () => {
    /* Until we have some idea how initial distribution is done, this *does* use
     *a test-function
     */
    const stake = toBN(10).pow(toBN(18)).muln(50000);
    await initInflation.mint(balanceStore.address, accounts[1], stake);
    await initInflation.mint(balanceStore.address, accounts[2], stake);
    await initInflation.mint(balanceStore.address, accounts[3], stake);
    await initInflation.mint(balanceStore.address, accounts[4], stake);
  });

  it('Increases time and kicks off processes', async () => {
    await time.increase(3600 * 24 * 40);
    await supervisor.processAllBlocks();
    await balanceStore.update(accounts[1]);
    await balanceStore.update(accounts[2]);
  });

  it('challenge root hash proposal', async () => {
    await supervisor.processAllBlocks();
    const addressRootHashProposal = Object.keys(supervisor.rootHashState)[0];
    const rootHashProposal = await InflationRootHashProposal.at(addressRootHashProposal);
    token.approve(addressRootHashProposal, await balanceStore.balance(accounts[1]), {
      from: accounts[1],
    });
    await rootHashProposal.challengeRootHashRequestAccount(supervisor.account,
      supervisor.rootHashState[addressRootHashProposal].tree.hash, 2, {
        from: accounts[1],
      });
    await supervisor.processAllBlocks();
  });

  it('propose wrong root hash proposal', async () => {
    const addressRootHashProposal = Object.keys(supervisor.rootHashState)[0];
    const rootHashProposal = await InflationRootHashProposal.at(addressRootHashProposal);
    token.approve(addressRootHashProposal, await balanceStore.balance(accounts[2]), {
      from: accounts[2],
    });
    const { tree } = supervisor.rootHashState[addressRootHashProposal];
    const wrongHash = web3.utils.toHex(web3.utils.toBN(tree.hash).sub(web3.utils.toBN('1')));
    await rootHashProposal.proposeRootHash(wrongHash,
      tree.total, tree.items, {
        from: accounts[1],
      });
    await supervisor.processAllBlocks();
  });

  it('Fetches started processes', async () => {
    policyProposals = await PolicyProposals.at(
      await util.policyFor(policy, policyProposalsIdentifierHash),
    );
    governance = await CurrencyGovernance.at(await util.policyFor(policy, governanceHash));
  });

  it('Constructs the proposals', async () => {
    makerich = await MakeRich.new(
      accounts[5],
      toBN(10).pow(toBN(18)).muln(1),
      { from: accounts[1] },
    );
    backdoor = await MakeBackdoor.new(accounts[2], { from: accounts[2] });
    makerich2 = await MakeRich.new(accounts[4], 1000000, { from: accounts[4] });
  });

  it('Accepts new proposals', async () => {
    await token.approve(
      policyProposals.address,
      await policyProposals.COST_REGISTER(),
      { from: accounts[1] },
    );
    await policyProposals.registerProposal(makerich.address, {
      from: accounts[1],
    });

    await token.approve(
      policyProposals.address,
      await policyProposals.COST_REGISTER(),
      { from: accounts[2] },
    );
    await policyProposals.registerProposal(backdoor.address, {
      from: accounts[2],
    });

    await token.approve(
      policyProposals.address,
      await policyProposals.COST_REGISTER(),
      { from: accounts[4] },
    );
    await policyProposals.registerProposal(makerich2.address, {
      from: accounts[4],
    });
  });

  it('Adds stake to proposals to ensure they are in the top 10', async () => {
    await policyProposals.support(makerich.address, [], { from: accounts[1] });

    await policyProposals.support(backdoor.address, [], { from: accounts[2] });
    await policyProposals.support(makerich.address, [], { from: accounts[2] });

    await policyProposals.support(makerich.address, [], { from: accounts[0] });
  });

  it('Transitions from proposing to voting', async () => {
    await supervisor.processAllBlocks();

    policyVotes = await PolicyVotes.at(
      await util.policyFor(policy, policyVotesIdentifierHash),
    );
  });

  it('Allows all users to vote', async () => {
    await policyVotes.vote(true, [],
      { from: accounts[1] });
    await policyVotes.vote(true, [],
      { from: accounts[2] });
  });

  it('Waits another week (end of voting period)', async () => {
    await time.increase(3600 * 24 * 7);
  });

  it('Executes the outcome of the votes', async () => {
    await supervisor.processAllBlocks();
  });

  it('Confirms the backdoor is not there', async () => {
    const backdoorHash = web3.utils.soliditySha3('Backdoor');
    assert.equal(await util.policyFor(policy, backdoorHash), 0);
  });

  it('Celebrates accounts[5]', async () => {
    expect(await token.balanceOf.call(accounts[5])).to.eq.BN(toBN(10).pow(toBN(18)));
    //    assert.equal((await token.balanceOf.call(accounts[5])).toString(), 1000000);
  });

  it('Waits another few months and starts stuff again', async () => {
    await time.increase(3600 * 24 * 90);
    await supervisor.processAllBlocks();
    governance = await CurrencyGovernance.at(await util.policyFor(policy, governanceHash));
  });

  const hash = (x) => web3.utils.soliditySha3(
    { type: 'bytes32', value: x[0] },
    { type: 'address', value: x[1] },
    { type: 'address', value: x[2] },
  );

  it('Commits, then reveals votes', async () => {
    const bob = accounts[1];
    await governance.propose(4500, 250, 0, 0, { from: bob });
    await time.increase(3600 * 24 * 7.1);

    const bobvote = [web3.utils.randomHex(32), bob, [bob]];
    await governance.commit(hash(bobvote), { from: bob });
    await time.increase(3600 * 24 * 3);
    await governance.reveal(bobvote[0], bobvote[2], { from: bob });
    await time.increase(3600 * 24 * 1);
    await governance.updateStage();
    await governance.compute();
    await time.increase(3600 * 24 * 3);
    await supervisor.processBlock();
    await awaitAllVDFEnded();
  });

  it('Solves the entropy VDF', async () => {
    await time.increase(3600 * 24 * 2 + 1);
    await supervisor.processAllBlocks();
    await awaitAllVDFEnded();
  });

  it('Gets rich baby', async () => {
    await time.increase(3600 * 24 * 28 + 1);
    await supervisor.processAllBlocks();
  });

  it('Lockup time!', async () => {
    governance = await CurrencyGovernance.at(await util.policyFor(policy, governanceHash));
    const bob = accounts[1];
    await governance.propose(0, 0, 4500, 250, { from: bob });
    await time.increase(3600 * 24 * 7.1);

    const bobvote = [web3.utils.randomHex(32), bob, [bob]];
    await governance.commit(hash(bobvote), { from: bob });
    await time.increase(3600 * 24 * 3);
    await governance.reveal(bobvote[0], bobvote[2], { from: bob });
    await time.increase(3600 * 24 * 1);
    await governance.updateStage();
    await governance.compute();
    await time.increase(3600 * 24 * 3);
    await supervisor.processBlock();
    await awaitAllVDFEnded();
  });

  it('Locks up', async () => {
    const [address] = (await currencyTimer.getPastEvents('LockupOffered', { fromBlock: 0, toBlock: 'latest' }))
      .map((x) => x.returnValues.addr);
    assert(address, 'No address found');
    const lockup = await Lockup.at(address);
    await token.approve(address, 1000, { from: accounts[1] });
    await lockup.deposit(1000, { from: accounts[1] });
  });

  it('Waits for that to get paid out too', async () => {
    await time.increase(3600 * 24 * 35 + 1);
    await supervisor.processAllBlocks();
  });
});
