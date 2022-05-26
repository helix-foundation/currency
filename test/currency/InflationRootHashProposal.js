/* eslint no-loop-func: 0 */
/* eslint no-await-in-loop: 0 */
/* eslint no-empty: 0 */
/* eslint no-bitwise: 0 */
/* eslint no-return-await: 0 */

const chai = require('chai');

const {
  BN,
} = web3.utils;
const bnChai = require('bn-chai');

const {
  expect,
} = chai;
const InflationRootHashProposal = artifacts.require('InflationRootHashProposal');

const {
  expectEvent,
  expectRevert,
  time,
} = require('@openzeppelin/test-helpers');
const {
  getTree,
  answer,
  getRandomIntInclusive,
  getRandomIntInclusiveEven,
  getRandomIntInclusiveOdd,
} = require('../../tools/randomInflationUtils');

const util = require('../../tools/test/util');

chai.use(bnChai(BN));

contract('InflationRootHashProposal', () => {
  let rootHashProposal;
  let initInflation;
  let txProposal;
  let timedPolicies;
  let currencyTimer;
  let eco;
  let accounts;
  let counter = 0;
  let currAcc;

  before(async () => {
    const originalAccounts = (await web3.eth.getAccounts());
    for (let i = 0; i < 200; i += 1) {
      await web3.eth.personal.unlockAccount(await web3.eth.personal.newAccount());
    }
    accounts = (await web3.eth.getAccounts()).sort((a, b) => Number(a - b));
    for (let i = 0; i < originalAccounts.length; i += 1) {
      await web3.eth.sendTransaction({
        from: originalAccounts[i],
        to: accounts[i],
        value: web3.utils.toWei('40', 'ether'),
      });
    }
  });

  beforeEach('global setup', async () => {
    currAcc = accounts[counter];
    ({
      eco,
      initInflation,
      timedPolicies,
      currencyTimer,
      rootHashProposal,
    } = await util.deployPolicy(currAcc));
    counter += 1;
    await time.increase(31557600 / 10);
    txProposal = await timedPolicies.incrementGeneration();
  });

  async function verifyOnChain(tree, index, proposer) {
    const a = answer(tree, index);
    await rootHashProposal.challengeRootHashRequestAccount(proposer, index, {
      from: accounts[1],
    });
    await rootHashProposal.respondToChallenge(
      accounts[1],
      a[1].reverse(),
      a[0].account,
      new BN(a[0].balance),
      new BN(a[0].sum),
      index,
      {
        from: proposer,
      },
    );
    return true;
  }

  async function claimMissingOnChain(tree, account, index, proposer) {
    try {
      const tx = await rootHashProposal.claimMissingAccount(
        proposer,
        index,
        account,
        {
          from: accounts[1],
        },
      );
      await expectEvent.inTransaction(
        tx.tx,
        InflationRootHashProposal,
        'ChallengeMissingAccountSuccess',
      );
      await expectEvent.inTransaction(
        tx.tx,
        InflationRootHashProposal,
        'RootHashRejected',
      );
      return true;
    } catch (e) {
      return false;
    }
  }

  async function interrogateOnChain(auth, victim, proposer) {
    let index = 0;
    if (victim.hash === auth.hash) {
      return [true, 0];
    }

    for (let k = 0; k < 50; k += 1) {
      const mine = answer(auth, index);
      const theirs = answer(victim, index);

      try {
        await verifyOnChain(victim, index, proposer);
      } catch (e) {
        return [false, k];
      }

      if (theirs[0].account > mine[0].account) {
        if (index > 0) {
          k += 1;
          try {
            await verifyOnChain(victim, index - 1, proposer);
          } catch (e) {
            return [false, k];
          }
        }
        if (!await claimMissingOnChain(victim, mine[0].account, index)) {} else {
          return [false, k];
        }
      }

      for (let i = 0; i < mine[1].length; i += 1) {
        const a = mine[1][mine[1].length - i - 1];
        const b = theirs[1][theirs[1].length - i - 1];
        if (a !== b) {
          index += (1 << i);
          break;
        }
      }
    }
    return [true, 1000];
  }

  async function getRootHash() {
    for (let i = 0; i < 2; i += 1) {
      await time.increase(31557600 / 10);
      txProposal = await timedPolicies.incrementGeneration();
    }
    const [event] = (await currencyTimer.getPastEvents('InflationRootHashProposalStarted'));
    const addressRootHashProposal = event.args.inflationRootHashProposalContract;
    for (let i = 0; i < 10; i += 1) {
      eco.approve(addressRootHashProposal, (await eco.balanceOf(accounts[i])).mul(
        web3.utils.toBN(100),
      ), {
        from: accounts[i],
      });
    }
    return await InflationRootHashProposal.at(addressRootHashProposal);
  }

  context('manual tests', () => {
    const totalSum = new BN('300000000000000000000000000');
    const amountOfAccounts = 3;
    let tree;
    let proposedRootHash;
    let map;
    beforeEach(async () => {
      map = new Map([
        [accounts[0], new BN('50000000000000000000000000')],
        [accounts[1], new BN('100000000000000000000000000')],
        [accounts[2], new BN('150000000000000000000000000')],
      ]);
      await initInflation.mint(
        eco.address,
        accounts[0],
        new BN('50000000000000000000000000'),
      );
      await initInflation.mint(
        eco.address,
        accounts[1],
        new BN('100000000000000000000000000'),
      );
      await initInflation.mint(
        eco.address,
        accounts[2],
        new BN('150000000000000000000000000'),
      );

      tree = getTree(map);
      proposedRootHash = tree.hash;
      rootHashProposal = await getRootHash();

      txProposal = await rootHashProposal.proposeRootHash(
        proposedRootHash,
        totalSum,
        amountOfAccounts,
        {
          from: accounts[0],
        },
      );
    });

    context('basic cases', () => {
      it('succeeds', async () => {
        await expectEvent.inTransaction(
          txProposal.tx,
          InflationRootHashProposal,
          'RootHashProposed',
          {
            proposer: accounts[0],
            proposedRootHash,
            totalSum: totalSum.toString(),
            amountOfAccounts: amountOfAccounts.toString(),
          },
        );
      });

      it('challenge submitted', async () => {
        const requestedIndex = 0;
        const tx = await rootHashProposal.challengeRootHashRequestAccount(
          accounts[0],
          requestedIndex,
          {
            from: accounts[1],
          },
        );
        await expectEvent.inTransaction(
          tx.tx,
          InflationRootHashProposal,
          'RootHashChallengeIndexRequestAdded',
          {
            challenger: accounts[1],
            proposedRootHash,
            index: requestedIndex.toString(),
          },
        );
      });

      it('challenge submitted and cannot be repeated', async () => {
        const requestedIndex = 0;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[0],
          requestedIndex,
          {
            from: accounts[1],
          },
        );
        await expectRevert(rootHashProposal.challengeRootHashRequestAccount(
          accounts[0],
          requestedIndex,
          {
            from: accounts[1],
          },
        ), 'Index already challenged');
      });

      it('challenge responded successfully', async () => {
        const requestedIndex = 2;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[0],
          requestedIndex,
          {
            from: accounts[1],
          },
        );
        const a = answer(tree, 2);
        const tx = await rootHashProposal.respondToChallenge(
          accounts[1],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[0],
          },
        );
        await expectEvent.inTransaction(
          tx.tx,
          InflationRootHashProposal,
          'ChallengeResponseVerified',
          {
            challenger: accounts[1],
            proposedRootHash,
            account: a[0].account.toString(),
            balance: a[0].balance.toString(),
            sum: a[0].sum.toString(),
            index: requestedIndex.toString(),
          },
        );
      });

      it('cannot re-challenge after successful response', async () => {
        const requestedIndex = 2;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[0],
          requestedIndex,
          {
            from: accounts[1],
          },
        );
        const a = answer(tree, 2);
        await rootHashProposal.respondToChallenge(
          accounts[1],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[0],
          },
        );
        await expectRevert(rootHashProposal.challengeRootHashRequestAccount(
          accounts[0],
          requestedIndex,
          {
            from: accounts[1],
          },
        ), 'requested index already responded');
      });

      it('catches balance cheats', async () => {
        const cheat = new Map(map);
        const cheatBalance = new BN('200000000000000000000000000');
        cheat.set(accounts[3], cheatBalance);
        const ct = getTree(cheat);
        proposedRootHash = ct.hash;
        txProposal = await rootHashProposal.proposeRootHash(
          proposedRootHash,
          totalSum.add(cheatBalance),
          amountOfAccounts + 1,
          {
            from: accounts[2],
          },
        );
        expect(await verifyOnChain(ct, 2, accounts[2]));
        expect(await verifyOnChain(ct, 1, accounts[2]));
        expect(await verifyOnChain(ct, 0, accounts[2]));
        await expectRevert(
          verifyOnChain(ct, 3, accounts[2]),
          'Challenge response failed account balance check',
        );
      });

      it('doesnt allow double configuration', async () => {
        await expectRevert(
          rootHashProposal.configure(1),
          'This instance has already been configured',
        );
      });

      it('doesnt allow double proposal', async () => {

      });

      it('missing account', async () => {
        const cheat = new Map(map);
        cheat.delete(accounts[1]);
        const ct = getTree(cheat);
        proposedRootHash = ct.hash;
        await expectRevert(
          rootHashProposal.proposeRootHash(
            proposedRootHash,
            new BN('200000000000000000000000000'),
            0,
            {
              from: accounts[2],
            },
          ),
          'Hash must consist of at least 1 account',
        );

        txProposal = await rootHashProposal.proposeRootHash(
          proposedRootHash,
          new BN('200000000000000000000000000'),
          2,
          {
            from: accounts[2],
          },
        );

        await expectRevert(
          rootHashProposal.proposeRootHash(
            proposedRootHash,
            new BN('200000000000000000000000000'),
            2,
            {
              from: accounts[2],
            },
          ),
          'Root hash already proposed',
        );
        expect(await verifyOnChain(ct, 0, accounts[2]));
        expect(await verifyOnChain(ct, 1, accounts[2]));
        expect(await claimMissingOnChain(ct, accounts[1], 1, accounts[2]));
        await expectRevert(
          rootHashProposal.claimMissingAccount(
            accounts[2],
            1,
            accounts[1],
            {
              from: accounts[1],
            },
          ),
          'The proposal is resolved',
        );
      });
    });

    context('specific cases', () => {
      it('does not accept challenges from root hash proposer', async () => {
        await expectRevert(
          rootHashProposal.challengeRootHashRequestAccount(
            accounts[0],
            0,
            {
              from: accounts[0],
            },
          ),
          'Root hash proposer can\'t challenge its own submission',
        );
      });

      it('does not accept response not from original proposer', async () => {
        const requestedIndex = 2;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[0],
          requestedIndex,
          {
            from: accounts[1],
          },
        );

        await expectRevert(
          rootHashProposal.challengeRootHashRequestAccount(
            accounts[0],
            requestedIndex,
            {
              from: accounts[1],
            },
          ),
          'Index already challenged',
        );
      });

      it('does not accept response to not existing challenge', async () => {
        const requestedIndex = 2;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[0],
          requestedIndex,
          {
            from: accounts[1],
          },
        );
        const a = answer(tree, 2);
        await expectRevert(
          rootHashProposal.respondToChallenge(
            accounts[1],
            a[1].reverse(),
            a[0].account,
            new BN(a[0].balance),
            new BN(a[0].sum),
            requestedIndex + 1100,
            {
              from: accounts[0],
            },
          ),
          'There is no pending challenge for this index',
        );
      });

      it('does not accept challenge to nonexistent proposal', async () => {
        const requestedIndex = 2;
        await expectRevert(rootHashProposal.challengeRootHashRequestAccount(
          accounts[5],
          requestedIndex,
          {
            from: accounts[1],
          },
        ), 'There is no such hash proposal');
      });

      it('does not accept challenge for index greater than number of accounts', async () => {
        const requestedIndex = 2;
        await expectRevert(
          rootHashProposal.challengeRootHashRequestAccount(
            accounts[0],
            requestedIndex + 400,
            { from: accounts[1] },
          ),
          'The index have to be within the range of claimed amount of accounts',
        );
      });
    });

    context('verify challenge white box testing', async () => {
      it('fail balance check', async () => {
        await initInflation.mint(
          eco.address,
          accounts[2],
          new BN('150000000000000000000000000'),
        );

        rootHashProposal = await getRootHash();
        await rootHashProposal.proposeRootHash(
          proposedRootHash,
          totalSum,
          amountOfAccounts,
          {
            from: accounts[0],
          },
        );

        const requestedIndex = 2;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[0],
          requestedIndex,
          {
            from: accounts[1],
          },
        );
        const a = answer(tree, 2);
        await expectRevert(rootHashProposal.respondToChallenge(
          accounts[1],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[0],
          },
        ), 'Challenge response failed account balance check');
      });

      it('fail merkle proof', async () => {
        await initInflation.mint(
          eco.address,
          accounts[2],
          new BN('150000000000000000000000000'),
        );

        rootHashProposal = await getRootHash();
        await rootHashProposal.proposeRootHash(
          proposedRootHash,
          totalSum,
          amountOfAccounts,
          {
            from: accounts[0],
          },
        );

        const requestedIndex = 2;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[0],
          requestedIndex,
          {
            from: accounts[1],
          },
        );

        const a = answer(tree, 2);
        await expectRevert(rootHashProposal.respondToChallenge(
          accounts[1],
          a[1].reverse(),
          a[0].account,
          (new BN(a[0].balance)).add(new BN('150000000000000000000000000')),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[0],
          },
        ), 'Challenge response failed merkle tree verification check');
      });

      it('fail running sum first index', async () => {
        tree = getTree(map, [0, 100]);
        proposedRootHash = tree.hash;
        txProposal = await rootHashProposal.proposeRootHash(
          proposedRootHash,
          totalSum,
          amountOfAccounts,
          {
            from: accounts[1],
          },
        );
        const requestedIndex = 0;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[1],
          requestedIndex,
          {
            from: accounts[2],
          },
        );
        const a = answer(tree, 0);
        await expectRevert(rootHashProposal.respondToChallenge(
          accounts[2],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[1],
          },
        ), 'cumulative sum does not starts from 0');
      });

      it('fail running sum right index', async () => {
        map = new Map([
          [accounts[0], await eco.balanceOf(accounts[0])],
          [accounts[1], await eco.balanceOf(accounts[1])],
          [accounts[2], await eco.balanceOf(accounts[2])],
          [accounts[3], await eco.balanceOf(accounts[2])],
        ]);
        rootHashProposal = await getRootHash();
        tree = getTree(map, [2, 300000]);
        proposedRootHash = tree.hash;
        txProposal = await rootHashProposal.proposeRootHash(
          proposedRootHash,
          totalSum,
          amountOfAccounts + 1,
          {
            from: accounts[1],
          },
        );

        let requestedIndex = 2;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[1],
          requestedIndex,
          {
            from: accounts[2],
          },
        );
        let a = answer(tree, requestedIndex);
        const tx = await rootHashProposal.respondToChallenge(
          accounts[2],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[1],
          },
        );
        await expectEvent.inTransaction(
          tx.tx,
          InflationRootHashProposal,
          'ChallengeResponseVerified',
        );

        requestedIndex = 1;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[1],
          requestedIndex,
          {
            from: accounts[2],
          },
        );
        a = answer(tree, requestedIndex);
        await expectRevert(rootHashProposal.respondToChallenge(
          accounts[2],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[1],
          },
        ), 'Right neighbor sum verification failed');
      });

      it('fail running sum left index', async () => {
        map = new Map([
          [accounts[0], await eco.balanceOf(accounts[0])],
          [accounts[1], await eco.balanceOf(accounts[1])],
          [accounts[2], await eco.balanceOf(accounts[2])],
          [accounts[3], await eco.balanceOf(accounts[2])],
        ]);
        rootHashProposal = await getRootHash();
        tree = getTree(map, [2, 500]);
        proposedRootHash = tree.hash;
        await rootHashProposal.proposeRootHash(
          proposedRootHash,
          totalSum,
          amountOfAccounts + 1,
          {
            from: accounts[1],
          },
        );

        let requestedIndex = 1;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[1],
          requestedIndex,
          {
            from: accounts[2],
          },
        );
        let a = answer(tree, requestedIndex);
        const tx = await rootHashProposal.respondToChallenge(
          accounts[2],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[1],
          },
        );
        await expectEvent.inTransaction(
          tx.tx,
          InflationRootHashProposal,
          'ChallengeResponseVerified',
        );

        requestedIndex = 2;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[1],
          requestedIndex,
          {
            from: accounts[2],
          },
        );
        a = answer(tree, requestedIndex);
        await expectRevert(rootHashProposal.respondToChallenge(
          accounts[2],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[1],
          },
        ), 'Left neighbor sum verification failed');
      });

      it('fail total sum, last index', async () => {
        map = new Map([
          [accounts[0], await eco.balanceOf(accounts[0])],
          [accounts[1], await eco.balanceOf(accounts[1])],
          [accounts[2], await eco.balanceOf(accounts[2])],
        ]);
        rootHashProposal = await getRootHash();
        tree = getTree(map, [2, 500]);
        proposedRootHash = tree.hash;
        await rootHashProposal.proposeRootHash(
          proposedRootHash,
          totalSum,
          amountOfAccounts,
          {
            from: accounts[1],
          },
        );

        const requestedIndex = 2;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[1],
          requestedIndex,
          {
            from: accounts[2],
          },
        );
        const a = answer(tree, requestedIndex);
        await expectRevert(rootHashProposal.respondToChallenge(
          accounts[2],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[1],
          },
        ), 'cumulative sum does not match total sum');
      });

      it('fail account order first index', async () => {
        rootHashProposal = await getRootHash();
        tree = getTree(map, [], [0, 2]);
        proposedRootHash = tree.hash;
        txProposal = await rootHashProposal.proposeRootHash(
          proposedRootHash,
          totalSum,
          amountOfAccounts,
          {
            from: accounts[1],
          },
        );

        let requestedIndex = 1;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[1],
          requestedIndex,
          {
            from: accounts[2],
          },
        );
        let a = answer(tree, requestedIndex);
        const tx = await rootHashProposal.respondToChallenge(
          accounts[2],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[1],
          },
        );
        await expectEvent.inTransaction(
          tx.tx,
          InflationRootHashProposal,
          'ChallengeResponseVerified',
        );

        requestedIndex = 0;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[1],
          requestedIndex,
          {
            from: accounts[2],
          },
        );
        a = answer(tree, requestedIndex);
        await expectRevert(rootHashProposal.respondToChallenge(
          accounts[2],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[1],
          },
        ), 'Right neighbor order verification failed');
      });

      it('fail account order middle index', async () => {
        tree = getTree(map, [], [0, 1]);
        proposedRootHash = tree.hash;
        txProposal = await rootHashProposal.proposeRootHash(
          proposedRootHash,
          totalSum,
          amountOfAccounts,
          {
            from: accounts[1],
          },
        );

        let requestedIndex = 0;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[1],
          requestedIndex,
          {
            from: accounts[2],
          },
        );
        let a = answer(tree, 0);
        const tx = await rootHashProposal.respondToChallenge(
          accounts[2],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[1],
          },
        );
        await expectEvent.inTransaction(
          tx.tx,
          InflationRootHashProposal,
          'ChallengeResponseVerified',
        );

        requestedIndex = 1;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[1],
          requestedIndex,
          {
            from: accounts[2],
          },
        );
        a = answer(tree, 1);
        await expectRevert(rootHashProposal.respondToChallenge(
          accounts[2],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[1],
          },
        ), 'Left neighbor order verification failed');
      });

      it('fail account order last index', async () => {
        tree = getTree(map, [], [0, 2]);
        proposedRootHash = tree.hash;
        txProposal = await rootHashProposal.proposeRootHash(
          proposedRootHash,
          totalSum,
          amountOfAccounts,
          {
            from: accounts[1],
          },
        );

        let requestedIndex = 1;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[1],
          requestedIndex,
          {
            from: accounts[2],
          },
        );
        let a = answer(tree, requestedIndex);
        const tx = await rootHashProposal.respondToChallenge(
          accounts[2],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[1],
          },
        );
        await expectEvent.inTransaction(
          tx.tx,
          InflationRootHashProposal,
          'ChallengeResponseVerified',
        );

        requestedIndex = 2;
        await rootHashProposal.challengeRootHashRequestAccount(
          accounts[1],
          requestedIndex,
          {
            from: accounts[2],
          },
        );
        a = answer(tree, requestedIndex);
        await expectRevert(rootHashProposal.respondToChallenge(
          accounts[2],
          a[1].reverse(),
          a[0].account,
          new BN(a[0].balance),
          new BN(a[0].sum),
          requestedIndex,
          {
            from: accounts[1],
          },
        ), 'Left neighbor order verification failed');
      });
    });

    context('accept and reject root hash', () => {
      it('succeeds', async () => {
        await time.increase(86401);
        expect((await currencyTimer.rootHashAddressPerGeneration((
          await eco.currentGeneration()) - 1)).toString(10) === '0');
        await expectEvent.inTransaction(
          (await rootHashProposal.checkRootHashStatus(
            accounts[0],
          )).tx,
          InflationRootHashProposal,
          'RootHashAccepted',
          {
            proposer: accounts[0],
            proposedRootHash,
            totalSum: totalSum.toString(),
            amountOfAccounts: amountOfAccounts.toString(),
          },
        );
        expect((await currencyTimer.rootHashAddressPerGeneration((
          await eco.currentGeneration()) - 1)).toString(10)
          === rootHashProposal.address.toString(10));

        await rootHashProposal.claimFee(accounts[0], { from: accounts[0] });

        await expectRevert(
          rootHashProposal.claimFee(accounts[0], { from: accounts[1] }),
          'challenger may claim fee on rejected proposal only',
        );

        await time.increase(86400000);
        await rootHashProposal.destruct();
      });

      it('cannot destruct before fee collection period ends', async () => {
        await time.increase(86401);
        await rootHashProposal.checkRootHashStatus(
          accounts[0],
        );
        await expectRevert(
          rootHashProposal.destruct(),
          'contract might be destructed after fee collection period is over',
        );
      });

      // TODO
      // it('fails', async () => {
      //   await time.increase(86401);
      //   expect((await currencyTimer.rootHashAddressPerGeneration((
      //     await eco.currentGeneration()) - 1)).toString(10) === '0');
      //   await expectEvent.inTransaction(
      //     (await rootHashProposal.checkRootHashStatus(
      //       '0x0000000000000000000000000000000000000000',
      //     )).tx,
      //     InflationRootHashProposal,
      //     'RootHashRejected',
      //     {
      //       proposer: '0x0000000000000000000000000000000000000000',
      //       proposedRootHash
      //     },
      //   );
      //   TODO: claim Fee for rejector
      // });

      it('no external function run once hash been accepted', async () => {
        await time.increase(86401);
        await expectEvent.inTransaction(
          (await rootHashProposal.checkRootHashStatus(
            accounts[0],
          )).tx,
          InflationRootHashProposal,
          'RootHashAccepted',
        );

        await expectRevert(rootHashProposal.proposeRootHash(
          proposedRootHash,
          totalSum,
          amountOfAccounts,
          {
            from: accounts[1],
          },
        ), 'The root hash accepted, no more actions allowed');

        await expectRevert(rootHashProposal.challengeRootHashRequestAccount(
          accounts[0],
          0,
          {
            from: accounts[2],
          },
        ), 'The root hash accepted, no more actions allowed');

        const a = answer(tree, 0);
        await expectRevert(rootHashProposal.respondToChallenge(accounts[2], a[
          1].reverse(), a[0].account, new BN(a[0].balance), new BN(a[0]
          .sum), 0, {
          from: accounts[1],
        }), 'The root hash accepted, no more actions allowed');

        await expectRevert(rootHashProposal.claimMissingAccount(
          accounts[0],
          0,
          accounts[0],
          {
            from: accounts[1],
          },
        ), 'The root hash accepted, no more actions allowed');
      });
    });

    context('incorrect claimMissingAccount', () => {
      it('cannot claim a fake account', async () => {
        const requestedIndex = 2;
        await expectRevert(rootHashProposal.claimMissingAccount(
          accounts[0],
          requestedIndex,
          accounts[9],
          {
            from: accounts[1],
          },
        ), 'Missing account does not exist');
      });

      it('must challenge before a claim', async () => {
        const requestedIndex = 2;
        await expectRevert(rootHashProposal.claimMissingAccount(
          accounts[0],
          requestedIndex,
          accounts[2],
          {
            from: accounts[1],
          },
        ), 'Submit Index Request first');
      });

      it('must challenge left side to claim', async () => {
        const requestedIndex = 2;
        expect(await verifyOnChain(tree, 0, accounts[0]));
        await expectRevert(rootHashProposal.claimMissingAccount(
          accounts[0],
          requestedIndex,
          accounts[2],
          {
            from: accounts[1],
          },
        ), 'Left _index is not resolved');
      });

      it('must challenge right side to claim', async () => {
        const requestedIndex = 0;
        expect(await verifyOnChain(tree, 2, accounts[0]));
        await expectRevert(rootHashProposal.claimMissingAccount(
          accounts[0],
          requestedIndex,
          accounts[2],
          {
            from: accounts[1],
          },
        ), 'Right _index is not resolved');
      });

      it('left side must be less to claim', async () => {
        const requestedIndex = 2;
        expect(await verifyOnChain(tree, 1, accounts[0]));
        expect(await verifyOnChain(tree, 2, accounts[0]));
        await expectRevert(rootHashProposal.claimMissingAccount(
          accounts[0],
          requestedIndex,
          tree.left.left.account,
          {
            from: accounts[1],
          },
        ), 'Missing account claim failed');
      });

      it('right side must be greater to claim', async () => {
        const requestedIndex = 1;
        expect(await verifyOnChain(tree, 0, accounts[0]));
        expect(await verifyOnChain(tree, 1, accounts[0]));
        await expectRevert(rootHashProposal.claimMissingAccount(
          accounts[0],
          requestedIndex,
          tree.right.left.account,
          {
            from: accounts[1],
          },
        ), 'Missing account claim failed');
      });
    });

    context(
      'white box testing of state variables for accepting/rejecting root hahses',
      () => {
        async function getTime() {
          return (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
        }

        it('lastLiveChallenge correct calculation', async () => {
          let rhp = await rootHashProposal.rootHashProposals(accounts[0]);
          expect(rhp.lastLiveChallenge.toString(10) === '0').to.be.true;
          await rootHashProposal.challengeRootHashRequestAccount(
            accounts[0],
            0,
            {
              from: accounts[1],
            },
          );
          let t = await getTime();
          rhp = await rootHashProposal.rootHashProposals(accounts[0]);
          expect(rhp.lastLiveChallenge.toString(10) === (t + (3600 * 25)).toString(
            10,
          )).to.be.true;

          /* another challenger comes in, last live challenge gets updated */

          await time.increase(3600 * 10);
          await rootHashProposal.challengeRootHashRequestAccount(
            accounts[0],
            1,
            {
              from: accounts[2],
            },
          );
          t = await getTime();
          rhp = await rootHashProposal.rootHashProposals(accounts[0]);
          expect(rhp.lastLiveChallenge.toString(10) === (t + (3600 * 25)).toString(
            10,
          )).to.be.true;

          /* time passes, first challenger comes back, lastLiveChallenge remain the same. */

          await time.increase(3600 * 10);
          await rootHashProposal.challengeRootHashRequestAccount(
            accounts[0],
            2,
            {
              from: accounts[1],
            },
          );
          rhp = await rootHashProposal.rootHashProposals(accounts[0]);
          expect(rhp.lastLiveChallenge.toString(10) === (t + (3600 * 25)).toString(
            10,
          )).to.be.true;
        });

        it('doesnt allow a challenge past the time limit', async () => {
          let rhp = await rootHashProposal.rootHashProposals(accounts[0]);
          expect(rhp.amountPendingChallenges.toString(10) === '0').to.be.true;

          await rootHashProposal.challengeRootHashRequestAccount(
            accounts[0],
            0,
            {
              from: accounts[1],
            },
          );

          rhp = await rootHashProposal.rootHashProposals(accounts[0]);
          expect(rhp.amountPendingChallenges.toString(10) === '1').to.be.true;

          const a = answer(tree, 0);
          await time.increase(86400000);
          await expectRevert(
            rootHashProposal.respondToChallenge(
              accounts[1],
              a[1].reverse(),
              a[0].account,
              new BN(a[0].balance),
              new BN(a[0].sum),
              0,
              {
                from: accounts[0],
              },
            ),
            'Timeframe to respond to a challenge is over',
          );
        });

        it('amountPendingChallenges correct calculation', async () => {
          let rhp = await rootHashProposal.rootHashProposals(accounts[0]);
          expect(rhp.amountPendingChallenges.toString(10) === '0').to.be.true;

          await rootHashProposal.challengeRootHashRequestAccount(
            accounts[0],
            0,
            {
              from: accounts[1],
            },
          );

          rhp = await rootHashProposal.rootHashProposals(accounts[0]);
          expect(rhp.amountPendingChallenges.toString(10) === '1').to.be.true;

          let a = answer(tree, 0);
          await rootHashProposal.respondToChallenge(
            accounts[1],
            a[1].reverse(),
            a[0].account,
            new BN(a[0].balance),
            new BN(a[0].sum),
            0,
            {
              from: accounts[0],
            },
          );

          rhp = await rootHashProposal.rootHashProposals(accounts[0]);
          expect(rhp.amountPendingChallenges.toString(10) === '0').to.be.true;

          await rootHashProposal.challengeRootHashRequestAccount(
            accounts[0],
            1,
            {
              from: accounts[1],
            },
          );
          await rootHashProposal.challengeRootHashRequestAccount(
            accounts[0],
            2,
            {
              from: accounts[2],
            },
          );

          rhp = await rootHashProposal.rootHashProposals(accounts[0]);
          expect(rhp.amountPendingChallenges.toString(10) === '2').to.be.true;

          a = answer(tree, 1);
          await rootHashProposal.respondToChallenge(
            accounts[1],
            a[1].reverse(),
            a[0].account,
            new BN(a[0].balance),
            new BN(a[0].sum),
            1,
            {
              from: accounts[0],
            },
          );

          rhp = await rootHashProposal.rootHashProposals(accounts[0]);
          expect(rhp.amountPendingChallenges.toString(10) === '1').to.be.true;

          a = answer(tree, 2);
          await rootHashProposal.respondToChallenge(
            accounts[2],
            a[1].reverse(),
            a[0].account,
            new BN(a[0].balance),
            new BN(a[0].sum),
            2,
            {
              from: accounts[0],
            },
          );

          rhp = await rootHashProposal.rootHashProposals(accounts[0]);
          expect(rhp.amountPendingChallenges.toString(10) === '0').to.be.true;
        });

        it('newChallengerSubmissionEnds correct calculation', async () => {
          await time.increase(3600 * 10);
          await rootHashProposal.proposeRootHash(
            `0x${web3.utils.toBN(proposedRootHash).add(new BN(1)).toString(16)}`,
            totalSum,
            amountOfAccounts,
            {
              from: accounts[1],
            },
          );
          await rootHashProposal.challengeRootHashRequestAccount(
            accounts[0],
            0,
            {
              from: accounts[1],
            },
          );
          await time.increase(3600 * 15);
          expectRevert(rootHashProposal.challengeRootHashRequestAccount(
            accounts[0],
            1,
            {
              from: accounts[2],
            },
          ), 'Time to submit new challenges is over');
          await rootHashProposal.challengeRootHashRequestAccount(
            accounts[0],
            1,
            {
              from: accounts[1],
            },
          );
          await rootHashProposal.challengeRootHashRequestAccount(
            accounts[1],
            0,
            {
              from: accounts[2],
            },
          );
        });

        it('requestPerChallenge correct calculation', async () => {
          function getBaseLog(x, y) {
            return Math.log(y) / Math.log(x);
          }
          const amountOfRequests = [16, 23, 1000, 1000000];
          let allowedAmountOfRequests;

          for (let i = 0; i < 8; i += 1) {
            await initInflation.mint(
              eco.address,
              accounts[i],
              new BN('10000000000000000000000000000000000000'),
            );
            eco.approve(
              rootHashProposal.address,
              await eco.balanceOf(accounts[i]),
              {
                from: accounts[i],
              },
            );
          }

          for (let i = 0; i < 4; i += 1) {
            await rootHashProposal.proposeRootHash(
              `0x${web3.utils.toBN(proposedRootHash).add(new BN(1 + i)).toString(16)}`,
              totalSum,
              amountOfRequests[i],
              {
                from: accounts[i + 1],
              },
            );
            allowedAmountOfRequests = 2 * Math.ceil(getBaseLog(2, amountOfRequests[
              i])) + 2;
            for (let j = 0; j < allowedAmountOfRequests; j += 1) {
              await rootHashProposal.challengeRootHashRequestAccount(accounts[i
                + 1], j, {
                from: accounts[i + 2],
              });
            }
            expectRevert(rootHashProposal.challengeRootHashRequestAccount(accounts[
              i + 1], allowedAmountOfRequests, {
              from: accounts[i + 2],
            }), 'Challenger reached maximum amount of allowed challenges');
          }
        });

        it('challengeEnds correct calculation', async () => {
          await rootHashProposal.proposeRootHash(
            `0x${web3.utils.toBN(proposedRootHash).add(new BN(1)).toString(16)}`,
            totalSum,
            10,
            {
              from: accounts[1],
            },
          );
          for (let i = 0; i < 3; i += 1) {
            await rootHashProposal.challengeRootHashRequestAccount(
              accounts[1],
              i,
              {
                from: accounts[2],
              },
            );
            await time.increase(3600);
          }
          await time.increase(3600 * 15);
          for (let i = 0; i < 3; i += 1) {
            await rootHashProposal.challengeRootHashRequestAccount(
              accounts[1],
              i + 3,
              {
                from: accounts[2],
              },
            );
            await time.increase(3600);
          }
          await time.increase(3600 * 7);
          await rootHashProposal.challengeRootHashRequestAccount(
            accounts[1],
            6,
            {
              from: accounts[2],
            },
          );
          await time.increase(3600 * 3);
          expectRevert(rootHashProposal.challengeRootHashRequestAccount(
            accounts[1],
            7,
            {
              from: accounts[2],
            },
          ), 'Time to submit additional challenges is over');
        });
      },
    );
  });

  context('random tests', () => {
    it('is complex', async () => {
      const list = [];
      const totalSum = new BN('0');
      const amountOfAccounts = 10;
      let tmp = new BN('0');
      for (let i = 1; i <= amountOfAccounts; i += 1) {
        tmp = (new BN('10000000000000000000000000')).mul(web3.utils.toBN(i));
        list.push([accounts[i - 1], tmp]);
        await initInflation.mint(
          eco.address,
          accounts[i - 1],
          tmp,
        );
        totalSum.iadd(tmp);
      }
      rootHashProposal = await getRootHash();

      for (let i = 0; i < amountOfAccounts; i += 1) {
        eco.approve(
          rootHashProposal.address,
          await eco.balanceOf(accounts[i]),
          {
            from: accounts[i],
          },
        );
      }

      const bigMap = new Map(list);
      const cheatMap = new Map(bigMap);
      cheatMap.set(accounts[4], new BN('100000000000000000000000000'));
      cheatMap.set(accounts[5], new BN('10000000000000000000000000'));

      const bigt = getTree(bigMap);
      const ct = getTree(cheatMap);

      const proposedRootHash = ct.hash;
      txProposal = await rootHashProposal.proposeRootHash(
        proposedRootHash,
        totalSum,
        amountOfAccounts,
        {
          from: accounts[0],
        },
      );
      expect(await verifyOnChain(ct, 9, accounts[0]));
      const {
        result,
        index,
      } = await interrogateOnChain(bigt, ct, accounts[0]);
      expect(result === false && (index === 4 || index === 5));
    });

    for (let k = 0; k <= 40; k += 1) {
      const action = getRandomIntInclusive(0, 3);
      let tmp;
      it(`random test ${k}, action ${action}`, async () => {
        let amountOfAccounts = getRandomIntInclusive(4, 10);
        let totalSum = new BN('0');
        const list = [];
        for (let i = 0; i < amountOfAccounts; i += 1) {
          tmp = (new BN('10000000000000000000000000')).mul(web3.utils.toBN(
            getRandomIntInclusive(1, 10000),
          ));
          list.push([accounts[2 * i], tmp]);
          await initInflation.mint(
            eco.address,
            accounts[2 * i],
            tmp,
          );
          totalSum.add(tmp);
        }

        rootHashProposal = await getRootHash();
        for (let i = 0; i < amountOfAccounts; i += 1) {
          eco.approve(rootHashProposal.address, await eco.balanceOf(accounts[
            i]), {
            from: accounts[i],
          });
        }
        const goodMap = new Map(list);
        const goodTree = getTree(goodMap);
        const badmap = new Map(goodMap);
        if (action === 0) /* Add something */ {
          amountOfAccounts += 1;
          tmp = (new BN('10000000000000000000000000')).mul(web3.utils.toBN(
            getRandomIntInclusive(1, 10000),
          ));
          totalSum = totalSum.add(tmp);

          badmap.set(accounts[getRandomIntInclusiveOdd(0, (2 * amountOfAccounts)
            - 1)], tmp);
        } else if (action === 1) /* Remove something */ {
          amountOfAccounts -= 1;
          badmap.delete(accounts[getRandomIntInclusiveEven(0, (2 * amountOfAccounts)
            - 1)]);
        } else if (action === 2) /* Change a balance */ {
          const acc = accounts[getRandomIntInclusiveEven(0, (2 * amountOfAccounts)
            - 1)];
          tmp = (new BN('10000000000000000000000000')).mul(web3.utils.toBN(
            getRandomIntInclusive(1, 10000),
          ));
          totalSum = totalSum.add(tmp);
          badmap.set(acc, tmp);
        } else if (action === 3) /* swap adjacent balances */ {
          if (amountOfAccounts <= 2) {
            // to avoid weird range in random acc gen
            amountOfAccounts += 4;
          }
          const accIndex = getRandomIntInclusiveEven(0, (2 * amountOfAccounts) - 4);
          const first = badmap.get(accounts[accIndex]);
          const second = badmap.get(accounts[accIndex + 2]);
          badmap.set(accounts[accIndex], second);
          badmap.set(accounts[accIndex + 2], first);
        }

        const badTree = getTree(badmap);

        assert.notDeepEqual(goodMap, badmap);

        await rootHashProposal.proposeRootHash(
          badTree.hash,
          totalSum,
          amountOfAccounts,
          {
            from: accounts[0],
          },
        );

        const [res, tests] = await interrogateOnChain(goodTree, badTree, accounts[0]);

        assert(!res);
        assert(
          tests <= Math.ceil(Math.log2(amountOfAccounts)),
          `Needed ${tests}, expected ${Math.ceil(Math.log2(amountOfAccounts))}`,
        );
      });
    }
  });
});
