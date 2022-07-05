/* eslint no-loop-func: 0 */
/* eslint no-await-in-loop: 0 */
/* eslint no-empty: 0 */
/* eslint no-bitwise: 0 */
/* eslint no-return-await: 0 */

const { expect } = require('chai');

const BN = require('bn.js');
const { ethers } = require('hardhat');
const {
  getTree,
  answer,
  getRandomIntInclusive,
  getRandomIntInclusiveEven,
  getRandomIntInclusiveOdd,
} = require('../../tools/randomInflationUtils');

const { BigNumber } = ethers;
const { ecoFixture } = require('../utils/fixtures');

const time = require('../utils/time');

describe('InflationRootHashProposal', () => {
  let rootHashProposal;
  let initInflation;
  let timedPolicies;
  let currencyTimer;
  let eco;
  let accounts;

  before(async () => {
    const originalAccounts = await ethers.getSigners();
    let comparableAccounts = await Promise.all(
      (await ethers.getSigners()).map(async (s) => [await s.getAddress(), s]),
    );
    comparableAccounts = comparableAccounts.sort((a, b) => a[0].localeCompare(b[0]));
    accounts = comparableAccounts.map((a) => a[1]);
    for (let i = 0; i < originalAccounts.length; i += 1) {
      await originalAccounts[i].sendTransaction({
        to: await accounts[i].getAddress(),
        value: ethers.utils.parseEther('40'),
      });
    }
  });

  const balanceBN = async (token, account) => new BN(
    (await token.balanceOf(await account.getAddress())).toString(),
  );

  beforeEach('global setup', async () => {
    const [, bob, charlie, dave] = accounts;
    const trustednodes = [
      await bob.getAddress(),
      await charlie.getAddress(),
      await dave.getAddress(),
    ];

    ({
      eco,
      faucet: initInflation,
      currencyTimer,
      rootHashProposal,
      timedPolicies,
    } = await ecoFixture(trustednodes));

    await time.increase(31557600 / 10);
    await timedPolicies.incrementGeneration();
  });

  async function verifyOnChain(tree, index, proposer) {
    const a = answer(tree, index);
    await rootHashProposal
      .connect(accounts[1])
      .challengeRootHashRequestAccount(await proposer.getAddress(), index);
    await rootHashProposal
      .connect(proposer)
      .respondToChallenge(
        await accounts[1].getAddress(),
        a[1].reverse(),
        a[0].account,
        BigNumber.from(a[0].balance.toString()),
        BigNumber.from(a[0].sum.toString()),
        index,
      );
    return true;
  }

  async function claimMissingOnChain(tree, account, index, proposer) {
    try {
      await expect(
        rootHashProposal.connect(accounts[1]).claimMissingAccount(proposer, index, account),
      )
        .to.emit(rootHashProposal, 'ChallengeMissingAccountSuccess')
        .to.emit(rootHashProposal, 'RootHashRejected');
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
        if (!(await claimMissingOnChain(victim, mine[0].account, index))) {
        } else {
          return [false, k];
        }
      }

      for (let i = 0; i < mine[1].length; i += 1) {
        const a = mine[1][mine[1].length - i - 1];
        const b = theirs[1][theirs[1].length - i - 1];
        if (a !== b) {
          index += 1 << i;
          break;
        }
      }
    }
    return [true, 1000];
  }

  async function getRootHash() {
    for (let i = 0; i < 2; i += 1) {
      await time.increase(31557600 / 10);
      await timedPolicies.incrementGeneration();
    }
    const events = await currencyTimer.queryFilter('NewInflationRootHashProposal');
    const event = events[events.length - 1];
    const addressRootHashProposal = event.args.inflationRootHashProposalContract;
    for (let i = 0; i < 10; i += 1) {
      eco
        .connect(accounts[i])
        .approve(
          addressRootHashProposal,
          (await eco.balanceOf(await accounts[i].getAddress())).mul(BigNumber.from(100)),
        );
    }
    return await ethers.getContractAt('InflationRootHashProposal', addressRootHashProposal);
  }

  context('manual tests', () => {
    const totalSum = BigNumber.from('300000000000000000000000000');
    const amountOfAccounts = 3;
    let tree;
    let proposedRootHash;
    let map;
    beforeEach(async () => {
      map = new Map([
        [await accounts[0].getAddress(), new BN('50000000000000000000000000')],
        [await accounts[1].getAddress(), new BN('100000000000000000000000000')],
        [await accounts[2].getAddress(), new BN('150000000000000000000000000')],
      ]);
      await initInflation.mint(await accounts[0].getAddress(), '50000000000000000000000000');
      await initInflation.mint(await accounts[1].getAddress(), '100000000000000000000000000');
      await initInflation.mint(await accounts[2].getAddress(), '150000000000000000000000000');
      await time.advanceBlock();
      await time.advanceBlock();

      tree = getTree(map);
      proposedRootHash = tree.hash;
      rootHashProposal = await getRootHash();

      await expect(
        rootHashProposal
          .connect(accounts[0])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts),
      )
        .to.emit(rootHashProposal, 'RootHashProposed')
        .withArgs(await accounts[0].getAddress(), proposedRootHash, totalSum, amountOfAccounts);
    });

    context('basic cases', () => {
      it('challenge submitted', async () => {
        const requestedIndex = 0;
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), requestedIndex),
        )
          .to.emit(rootHashProposal, 'RootHashChallengeIndexRequestAdded')
          .withArgs(
            await accounts[0].getAddress(),
            proposedRootHash,
            await accounts[1].getAddress(),
            requestedIndex,
          );
      });

      it('challenge submitted and cannot be repeated', async () => {
        const requestedIndex = 0;
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), requestedIndex);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), requestedIndex),
        ).to.be.revertedWith('Index already challenged');
      });

      it('challenge responded successfully', async () => {
        const requestedIndex = 2;
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), requestedIndex);
        const a = answer(tree, 2);
        await expect(
          rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[1].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        )
          .to.emit(rootHashProposal, 'ChallengeResponseVerified')
          .withArgs(
            await accounts[0].getAddress(),
            proposedRootHash,
            await accounts[1].getAddress(),
            a[0].account.toString(),
            a[0].balance.toString(),
            a[0].sum.toString(),
            requestedIndex.toString(),
          );
      });

      it('cannot re-challenge after successful response', async () => {
        const requestedIndex = 2;
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), requestedIndex);
        const a = answer(tree, 2);
        await rootHashProposal
          .connect(accounts[0])
          .respondToChallenge(
            await accounts[1].getAddress(),
            a[1].reverse(),
            a[0].account,
            BigNumber.from(a[0].balance.toString()),
            BigNumber.from(a[0].sum.toString()),
            requestedIndex,
          );
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), requestedIndex),
        ).to.be.revertedWith('requested index already responded');
      });

      it('catches balance cheats', async () => {
        const cheat = new Map(map);
        const cheatBalance = new BN('200000000000000000000000000');
        cheat.set(await accounts[3].getAddress(), cheatBalance);
        const ct = getTree(cheat);
        proposedRootHash = ct.hash;
        await rootHashProposal
          .connect(accounts[2])
          .proposeRootHash(
            proposedRootHash,
            totalSum.add(cheatBalance.toString()),
            amountOfAccounts + 1,
          );
        expect(await verifyOnChain(ct, 2, accounts[2]));
        expect(await verifyOnChain(ct, 1, accounts[2]));
        expect(await verifyOnChain(ct, 0, accounts[2]));
        await expect(verifyOnChain(ct, 3, accounts[2])).to.be.revertedWith(
          'Challenge response failed account balance check',
        );
      });

      it('doesnt allow double configuration', async () => {
        await expect(rootHashProposal.configure(1)).to.be.revertedWith(
          'This instance has already been configured',
        );
      });

      it('doesnt allow double proposal', async () => {});

      it('missing account', async () => {
        const cheat = new Map(map);
        cheat.delete(await accounts[1].getAddress());
        const ct = getTree(cheat);
        proposedRootHash = ct.hash;
        await expect(
          rootHashProposal
            .connect(accounts[2])
            .proposeRootHash(proposedRootHash, BigNumber.from('200000000000000000000000000'), 0),
        ).to.be.revertedWith('Hash must consist of at least 1 account');

        await rootHashProposal
          .connect(accounts[2])
          .proposeRootHash(proposedRootHash, BigNumber.from('200000000000000000000000000'), 2);

        await expect(
          rootHashProposal
            .connect(accounts[2])
            .proposeRootHash(proposedRootHash, BigNumber.from('200000000000000000000000000'), 2),
        ).to.be.revertedWith('Root hash already proposed');
        expect(await verifyOnChain(ct, 0, accounts[2]));
        expect(await verifyOnChain(ct, 1, accounts[2]));
        expect(
          await claimMissingOnChain(
            ct.toString(),
            await accounts[1].getAddress(),
            1,
            await accounts[2].getAddress(),
          ),
        );
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(await accounts[2].getAddress(), 1, await accounts[1].getAddress()),
        ).to.be.revertedWith('The proposal is resolved');
      });
    });

    context('specific cases', () => {
      it('does not accept challenges from root hash proposer', async () => {
        await expect(
          rootHashProposal
            .connect(accounts[0])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), 0),
        ).to.be.revertedWith("Root hash proposer can't challenge its own submission");
      });

      it('does not accept response not from original proposer', async () => {
        const requestedIndex = 2;
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), requestedIndex);

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), requestedIndex),
        ).to.be.revertedWith('Index already challenged');
      });

      it('does not accept response to not existing challenge', async () => {
        const requestedIndex = 2;
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), requestedIndex);
        const a = answer(tree, 2);
        await expect(
          rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[1].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex + 1100,
            ),
        ).to.be.revertedWith('There is no pending challenge for this index');
      });

      it('does not accept challenge to nonexistent proposal', async () => {
        const requestedIndex = 2;
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(await accounts[5].getAddress(), requestedIndex),
        ).to.be.revertedWith('There is no such hash proposal');
      });

      it('does not accept challenge for index greater than number of accounts', async () => {
        const requestedIndex = 2;
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), requestedIndex + 400),
        ).to.be.revertedWith('The index have to be within the range of claimed amount of accounts');
      });
    });

    context('verify challenge white box testing', async () => {
      it('fail balance check', async () => {
        await initInflation.mint(await accounts[2].getAddress(), '150000000000000000000000000');

        rootHashProposal = await getRootHash();
        await rootHashProposal
          .connect(accounts[0])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts);

        const requestedIndex = 2;
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), requestedIndex);
        const a = answer(tree, 2);
        await expect(
          rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[1].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.be.revertedWith('Challenge response failed account balance check');
      });

      it('fail merkle proof', async () => {
        await initInflation.mint(await accounts[2].getAddress(), '150000000000000000000000000');

        rootHashProposal = await getRootHash();
        await rootHashProposal
          .connect(accounts[0])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts);

        const requestedIndex = 2;
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), requestedIndex);

        const a = answer(tree, 2);
        await expect(
          rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[1].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()).add(
                BigNumber.from('150000000000000000000000000'),
              ),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.be.revertedWith('Challenge response failed merkle tree verification check');
      });

      it('fail running sum first index', async () => {
        tree = getTree(map, [0, 100]);
        proposedRootHash = tree.hash;
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts);
        const requestedIndex = 0;
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), requestedIndex);
        const a = answer(tree, 0);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.be.revertedWith('cumulative sum does not starts from 0');
      });

      it('fail running sum right index', async () => {
        map = new Map([
          [await accounts[0].getAddress(), await balanceBN(eco, accounts[0])],
          [await accounts[1].getAddress(), await balanceBN(eco, accounts[1])],
          [await accounts[2].getAddress(), await balanceBN(eco, accounts[2])],
          [await accounts[3].getAddress(), await balanceBN(eco, accounts[2])],
        ]);
        rootHashProposal = await getRootHash();
        tree = getTree(map, [2, 300000]);
        proposedRootHash = tree.hash;
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts + 1);

        let requestedIndex = 2;
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), requestedIndex);
        let a = answer(tree, requestedIndex);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.emit(rootHashProposal, 'ChallengeResponseVerified');

        requestedIndex = 1;
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), requestedIndex);
        a = answer(tree, requestedIndex);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.be.revertedWith('Right neighbor sum verification failed');
      });

      it('fail running sum left index', async () => {
        map = new Map([
          [await accounts[0].getAddress(), await balanceBN(eco, accounts[0])],
          [await accounts[1].getAddress(), await balanceBN(eco, accounts[1])],
          [await accounts[2].getAddress(), await balanceBN(eco, accounts[2])],
          [await accounts[3].getAddress(), await balanceBN(eco, accounts[2])],
        ]);
        rootHashProposal = await getRootHash();
        tree = getTree(map, [2, 500]);
        proposedRootHash = tree.hash;
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts + 1);

        let requestedIndex = 1;
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), requestedIndex);
        let a = answer(tree, requestedIndex);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.emit(rootHashProposal, 'ChallengeResponseVerified');

        requestedIndex = 2;
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), requestedIndex);
        a = answer(tree, requestedIndex);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.be.revertedWith('Left neighbor sum verification failed');
      });

      it('fail total sum, last index', async () => {
        map = new Map([
          [await accounts[0].getAddress(), await balanceBN(eco, accounts[0])],
          [await accounts[1].getAddress(), await balanceBN(eco, accounts[1])],
          [await accounts[2].getAddress(), await balanceBN(eco, accounts[2])],
        ]);
        rootHashProposal = await getRootHash();
        tree = getTree(map, [2, 500]);
        proposedRootHash = tree.hash;
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts);

        const requestedIndex = 2;
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), requestedIndex);
        const a = answer(tree, requestedIndex);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.be.revertedWith('cumulative sum does not match total sum');
      });

      it('fail account order first index', async () => {
        rootHashProposal = await getRootHash();
        tree = getTree(map, [], [0, 2]);
        proposedRootHash = tree.hash;
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts);

        let requestedIndex = 1;
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), requestedIndex);
        let a = answer(tree, requestedIndex);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.emit(rootHashProposal, 'ChallengeResponseVerified');

        requestedIndex = 0;
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), requestedIndex);
        a = answer(tree, requestedIndex);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.be.revertedWith('Right neighbor order verification failed');
      });

      it('fail account order middle index', async () => {
        tree = getTree(map, [], [0, 1]);
        proposedRootHash = tree.hash;
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts);

        let requestedIndex = 0;
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), requestedIndex);
        let a = answer(tree, 0);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.emit(rootHashProposal, 'ChallengeResponseVerified');

        requestedIndex = 1;
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), requestedIndex);
        a = answer(tree, 1);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.be.revertedWith('Left neighbor order verification failed');
      });

      it('fail account order last index', async () => {
        tree = getTree(map, [], [0, 2]);
        proposedRootHash = tree.hash;
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts);

        let requestedIndex = 1;
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), requestedIndex);
        let a = answer(tree, requestedIndex);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.emit(rootHashProposal, 'ChallengeResponseVerified');

        requestedIndex = 2;
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), requestedIndex);
        a = answer(tree, requestedIndex);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              requestedIndex,
            ),
        ).to.be.revertedWith('Left neighbor order verification failed');
      });
    });

    context('accept and reject root hash', () => {
      it('succeeds', async () => {
        await time.increase(86401);
        expect(
          (
            await currencyTimer.rootHashAddressPerGeneration((await eco.currentGeneration()) - 1)
          ).toString() === '0',
        );
        await expect(rootHashProposal.checkRootHashStatus(await accounts[0].getAddress()))
          .to.emit(rootHashProposal, 'RootHashAccepted')
          .withArgs(
            await accounts[0].getAddress(),
            proposedRootHash,
            totalSum.toString(),
            amountOfAccounts.toString(),
          );

        expect(
          (
            await currencyTimer.rootHashAddressPerGeneration((await eco.currentGeneration()) - 1)
          ).toString() === rootHashProposal.address.toString(),
        );

        await rootHashProposal.connect(accounts[0]).claimFee(await accounts[0].getAddress());

        await expect(
          rootHashProposal.connect(accounts[1]).claimFee(await accounts[0].getAddress()),
        ).to.be.revertedWith('challenger may claim fee on rejected proposal only');

        await time.increase(86400000);
        await rootHashProposal.destruct();
      });

      it('success rejects alternative proposed hashes', async () => {
        await time.increase(86401);
        expect(
          (
            await currencyTimer.rootHashAddressPerGeneration((await eco.currentGeneration()) - 1)
          ).toString() === '0',
        );
        await expect(rootHashProposal.checkRootHashStatus(await accounts[0].getAddress()))
          .to.emit(rootHashProposal, 'RootHashAccepted')
          .withArgs(
            await accounts[0].getAddress(),
            proposedRootHash,
            totalSum.toString(),
            amountOfAccounts.toString(),
          );
        expect(
          (
            await currencyTimer.rootHashAddressPerGeneration((await eco.currentGeneration()) - 1)
          ).toString() === rootHashProposal.address.toString(),
        );

        await rootHashProposal.connect(accounts[0]).claimFee(await accounts[0].getAddress());

        await expect(
          rootHashProposal.connect(accounts[1]).claimFee(await accounts[0].getAddress()),
        ).to.be.revertedWith('challenger may claim fee on rejected proposal only');

        await time.increase(86400000);
        await rootHashProposal.destruct();
      });

      it('cannot destruct before fee collection period ends', async () => {
        await time.increase(86401);
        await rootHashProposal.checkRootHashStatus(await accounts[0].getAddress());
        await expect(rootHashProposal.destruct()).to.be.revertedWith(
          'contract might be destructed after fee collection period is over',
        );
      });

      // TODO
      // it('fails', async () => {
      //   await time.increase(86401);
      //   expect((await currencyTimer.rootHashAddressPerGeneration((
      //     await eco.currentGeneration()) - 1)).toString() === '0');
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
        await expect(rootHashProposal.checkRootHashStatus(await accounts[0].getAddress())).to.emit(
          rootHashProposal,
          'RootHashAccepted',
        );

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts),
        ).to.be.revertedWith('The root hash accepted, no more actions allowed');

        await expect(
          rootHashProposal
            .connect(accounts[2])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), 0),
        ).to.be.revertedWith('The root hash accepted, no more actions allowed');

        const a = answer(tree, 0);
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              0,
            ),
        ).to.be.revertedWith('The root hash accepted, no more actions allowed');

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(await accounts[0].getAddress(), 0, await accounts[0].getAddress()),
        ).to.be.revertedWith('The root hash accepted, no more actions allowed');
      });
    });

    context('incorrect claimMissingAccount', () => {
      it('cannot claim a fake account', async () => {
        const requestedIndex = 2;
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex,
              await accounts[9].getAddress(),
            ),
        ).to.be.revertedWith('Missing account does not exist');
      });

      it('must challenge before a claim', async () => {
        const requestedIndex = 2;
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex,
              await accounts[2].getAddress(),
            ),
        ).to.be.revertedWith('Submit Index Request first');
      });

      it('must challenge left side to claim', async () => {
        const requestedIndex = 2;
        expect(await verifyOnChain(tree, 0, accounts[0]));
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex,
              await accounts[2].getAddress(),
            ),
        ).to.be.revertedWith('Left _index is not resolved');
      });

      it('must challenge right side to claim', async () => {
        const requestedIndex = 0;
        expect(await verifyOnChain(tree, 2, accounts[0]));
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex,
              await accounts[2].getAddress(),
            ),
        ).to.be.revertedWith('Right _index is not resolved');
      });

      it('left side must be less to claim', async () => {
        const requestedIndex = 2;
        expect(await verifyOnChain(tree, 1, accounts[0]));
        expect(await verifyOnChain(tree, 2, accounts[0]));
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex,
              tree.left.left.account,
            ),
        ).to.be.revertedWith('Missing account claim failed');
      });

      it('right side must be greater to claim', async () => {
        const requestedIndex = 1;
        expect(await verifyOnChain(tree, 0, accounts[0]));
        expect(await verifyOnChain(tree, 1, accounts[0]));
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex,
              tree.right.left.account,
            ),
        ).to.be.revertedWith('Missing account claim failed');
      });
    });

    context('white box testing of state variables for accepting/rejecting root hahses', () => {
      async function getTime() {
        return (await web3.eth.getBlock(await web3.eth.getBlockNumber())).timestamp;
      }

      it('lastLiveChallenge correct calculation', async () => {
        let rhp = await rootHashProposal.rootHashProposals(await accounts[0].getAddress());
        expect(rhp.lastLiveChallenge.toString() === '0').to.be.true;
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), 0);
        let t = await getTime();
        rhp = await rootHashProposal.rootHashProposals(await accounts[0].getAddress());
        expect(rhp.lastLiveChallenge.toString() === (t + 3600 * 25).toString(10)).to.be.true;

        /* another challenger comes in, last live challenge gets updated */

        await time.increase(3600 * 10);
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), 1);
        t = await getTime();
        rhp = await rootHashProposal.rootHashProposals(await accounts[0].getAddress());
        expect(rhp.lastLiveChallenge.toString() === (t + 3600 * 25).toString(10)).to.be.true;

        /* time passes, first challenger comes back, lastLiveChallenge remain the same. */

        await time.increase(3600 * 10);
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), 2);
        rhp = await rootHashProposal.rootHashProposals(await accounts[0].getAddress());
        expect(rhp.lastLiveChallenge.toString() === (t + 3600 * 25).toString(10)).to.be.true;
      });

      it('doesnt allow a challenge past the time limit', async () => {
        let rhp = await rootHashProposal.rootHashProposals(await accounts[0].getAddress());
        expect(rhp.amountPendingChallenges.toString() === '0').to.be.true;

        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), 0);

        rhp = await rootHashProposal.rootHashProposals(await accounts[0].getAddress());
        expect(rhp.amountPendingChallenges.toString() === '1').to.be.true;

        const a = answer(tree, 0);
        await time.increase(86400000);
        await expect(
          rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[1].getAddress(),
              a[1].reverse(),
              a[0].account,
              BigNumber.from(a[0].balance.toString()),
              BigNumber.from(a[0].sum.toString()),
              0,
            ),
        ).to.be.revertedWith('Timeframe to respond to a challenge is over');
      });

      it('amountPendingChallenges correct calculation', async () => {
        let rhp = await rootHashProposal.rootHashProposals(await accounts[0].getAddress());
        expect(rhp.amountPendingChallenges.toString() === '0').to.be.true;

        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), 0);

        rhp = await rootHashProposal.rootHashProposals(await accounts[0].getAddress());
        expect(rhp.amountPendingChallenges.toString() === '1').to.be.true;

        let a = answer(tree, 0);
        await rootHashProposal
          .connect(accounts[0])
          .respondToChallenge(
            await accounts[1].getAddress(),
            a[1].reverse(),
            a[0].account,
            BigNumber.from(a[0].balance.toString()),
            BigNumber.from(a[0].sum.toString()),
            0,
          );

        rhp = await rootHashProposal.rootHashProposals(await accounts[0].getAddress());
        expect(rhp.amountPendingChallenges.toString() === '0').to.be.true;

        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), 1);
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), 2);

        rhp = await rootHashProposal.rootHashProposals(await accounts[0].getAddress());
        expect(rhp.amountPendingChallenges.toString() === '2').to.be.true;

        a = answer(tree, 1);
        await rootHashProposal
          .connect(accounts[0])
          .respondToChallenge(
            await accounts[1].getAddress(),
            a[1].reverse(),
            a[0].account,
            BigNumber.from(a[0].balance.toString()),
            BigNumber.from(a[0].sum.toString()),
            1,
          );

        rhp = await rootHashProposal.rootHashProposals(await accounts[0].getAddress());
        expect(rhp.amountPendingChallenges.toString() === '1').to.be.true;

        a = answer(tree, 2);
        await rootHashProposal
          .connect(accounts[0])
          .respondToChallenge(
            await accounts[2].getAddress(),
            a[1].reverse(),
            a[0].account,
            BigNumber.from(a[0].balance.toString()),
            BigNumber.from(a[0].sum.toString()),
            2,
          );

        rhp = await rootHashProposal.rootHashProposals(await accounts[0].getAddress());
        expect(rhp.amountPendingChallenges.toString() === '0').to.be.true;
      });

      it('newChallengerSubmissionEnds correct calculation', async () => {
        await time.increase(3600 * 10);
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(
            BigNumber.from(proposedRootHash).add(BigNumber.from(1)).toHexString(),
            totalSum,
            amountOfAccounts,
          );
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), 0);
        await time.increase(3600 * 15);
        expect(
          rootHashProposal
            .connect(accounts[2])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), 1),
        ).to.be.revertedWith('Time to submit new challenges is over');
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(await accounts[0].getAddress(), 1);
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), 0);
      });

      it('requestPerChallenge correct calculation', async () => {
        function getBaseLog(x, y) {
          return Math.log(y) / Math.log(x);
        }
        const amountOfRequests = [16, 23, 1000, 1000000];
        let allowedAmountOfRequests;

        for (let i = 0; i < 8; i += 1) {
          await initInflation.mint(
            await accounts[i].getAddress(),
            '10000000000000000000000000000000000000',
          );
          eco
            .connect(accounts[i])
            .approve(rootHashProposal.address, await eco.balanceOf(await accounts[i].getAddress()));
        }

        for (let i = 0; i < 4; i += 1) {
          await rootHashProposal.connect(accounts[i + 1]).proposeRootHash(
            BigNumber.from(proposedRootHash)
              .add(BigNumber.from(1 + i))
              .toHexString(),
            totalSum,
            amountOfRequests[i],
          );
          allowedAmountOfRequests = 2 * Math.ceil(getBaseLog(2, amountOfRequests[i])) + 2;
          for (let j = 0; j < allowedAmountOfRequests; j += 1) {
            await rootHashProposal
              .connect(accounts[i + 2])
              .challengeRootHashRequestAccount(await accounts[i + 1].getAddress(), j);
          }
          expect(
            rootHashProposal
              .connect(accounts[i + 2])
              .challengeRootHashRequestAccount(
                await accounts[i + 1].getAddress(),
                allowedAmountOfRequests,
              ),
          ).to.be.revertedWith('Challenger reached maximum amount of allowed challenges');
        }
      });

      it('challengeEnds correct calculation', async () => {
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(
            BigNumber.from(proposedRootHash).add(BigNumber.from(1)).toHexString(),
            totalSum,
            10,
          );
        for (let i = 0; i < 3; i += 1) {
          await rootHashProposal
            .connect(accounts[2])
            .challengeRootHashRequestAccount(await accounts[1].getAddress(), i);
          await time.increase(3600);
        }
        await time.increase(3600 * 15);
        for (let i = 0; i < 3; i += 1) {
          await rootHashProposal
            .connect(accounts[2])
            .challengeRootHashRequestAccount(await accounts[1].getAddress(), i + 3);
          await time.increase(3600);
        }
        await time.increase(3600 * 7);
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(await accounts[1].getAddress(), 6);
        await time.increase(3600 * 3);
        expect(
          rootHashProposal
            .connect(accounts[2])
            .challengeRootHashRequestAccount(await accounts[1].getAddress(), 7),
        ).to.be.revertedWith('Time to submit additional challenges is over');
      });
    });
  });

  context('random tests', () => {
    it('is complex', async () => {
      const list = [];
      let totalSum = BigNumber.from('0');
      const amountOfAccounts = 10;
      let tmp = BigNumber.from('0');
      for (let i = 1; i <= amountOfAccounts; i += 1) {
        tmp = BigNumber.from('10000000000000000000000000').mul(i);
        list.push([await accounts[i - 1].getAddress(), new BN(tmp.toString())]);
        await initInflation.mint(await accounts[i - 1].getAddress(), tmp.toString());
        totalSum = totalSum.add(tmp.toString());
      }
      rootHashProposal = await getRootHash();

      for (let i = 0; i < amountOfAccounts; i += 1) {
        eco
          .connect(accounts[1])
          .approve(rootHashProposal.address, await eco.balanceOf(await accounts[i].getAddress()));
      }

      const bigMap = new Map(list);
      const cheatMap = new Map(bigMap);
      cheatMap.set(await accounts[4].getAddress(), new BN('100000000000000000000000000'));
      cheatMap.set(await accounts[5].getAddress(), new BN('10000000000000000000000000'));

      const bigt = getTree(bigMap);
      const ct = getTree(cheatMap);

      const proposedRootHash = ct.hash;
      await rootHashProposal
        .connect(accounts[0])
        .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts);
      expect(await verifyOnChain(ct, 9, accounts[0]));
      const { result, index } = await interrogateOnChain(bigt, ct, await accounts[0].getAddress());
      expect(result === false && (index === 4 || index === 5));
    });

    for (let k = 0; k <= 40; k += 1) {
      const action = getRandomIntInclusive(0, 3);
      let tmp;
      it(`random test ${k}, action ${action}`, async () => {
        let amountOfAccounts = getRandomIntInclusive(4, 10);
        let totalSum = BigNumber.from('0');
        const list = [];
        for (let i = 0; i < amountOfAccounts; i += 1) {
          tmp = BigNumber.from('10000000000000000000000000').mul(getRandomIntInclusive(1, 10000));
          list.push([await accounts[2 * i].getAddress(), new BN(tmp.toString())]);
          await initInflation.mint(await accounts[2 * i].getAddress(), tmp.toString());
          totalSum = totalSum.add(tmp);
        }

        rootHashProposal = await getRootHash();
        for (let i = 0; i < amountOfAccounts; i += 1) {
          eco
            .connect(accounts[i])
            .approve(rootHashProposal.address, await eco.balanceOf(await accounts[i].getAddress()));
        }
        const goodMap = new Map(list);
        const goodTree = getTree(goodMap);
        const badmap = new Map(goodMap);
        if (action === 0) {
          /* Add something */
          amountOfAccounts += 1;
          tmp = BigNumber.from('10000000000000000000000000').mul(getRandomIntInclusive(1, 10000));
          totalSum = totalSum.add(tmp);

          badmap.set(
            await accounts[getRandomIntInclusiveOdd(0, 2 * amountOfAccounts - 1)].getAddress(),
            new BN(tmp.toString()),
          );
        } else if (action === 1) {
          /* Remove something */
          amountOfAccounts -= 1;
          badmap.delete(
            await accounts[getRandomIntInclusiveEven(0, 2 * amountOfAccounts - 1)].getAddress(),
          );
        } else if (action === 2) {
          /* Change a balance */
          const acc = accounts[getRandomIntInclusiveEven(0, 2 * amountOfAccounts - 1)];
          tmp = BigNumber.from('10000000000000000000000000').mul(getRandomIntInclusive(1, 10000));
          totalSum = totalSum.add(tmp);
          badmap.set(await acc.getAddress(), new BN(tmp.toString()));
        } else if (action === 3) {
          /* swap adjacent balances */
          if (amountOfAccounts <= 2) {
            // to avoid weird range in random acc gen
            amountOfAccounts += 4;
          }
          const accIndex = getRandomIntInclusiveEven(0, 2 * amountOfAccounts - 4);
          const first = badmap.get(await accounts[accIndex].getAddress());
          const second = badmap.get(await accounts[accIndex + 2].getAddress());
          badmap.set(await accounts[accIndex].getAddress(), second);
          badmap.set(await accounts[accIndex + 2].getAddress(), first);
        }

        const badTree = getTree(badmap);

        assert.notDeepEqual(goodMap, badmap);

        await rootHashProposal
          .connect(accounts[0])
          .proposeRootHash(badTree.hash, totalSum, amountOfAccounts);

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