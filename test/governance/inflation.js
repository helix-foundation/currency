/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */

const bigintCryptoUtils = require('bigint-crypto-utils');
const { expect } = require('chai');
const BN = require('bn.js');
const web3 = require('web3');

const { toBN } = web3.utils;

const { ethers } = require('hardhat');
const { prove, bnHex } = require('../../tools/vdf');
const { getTree, answer } = require('../../tools/randomInflationUtils');

const { ecoFixture } = require('../utils/fixtures');

const time = require('../utils/time');
const util = require('../../tools/test/util');

describe('RandomInflation [@group=6]', () => {
  let policy;
  let eco;
  let governance;
  let initInflation;
  let addressRootHashProposal;
  let tree;
  let proposedRootHash;
  let rootHashProposal;
  let inflation;
  let currencyTimer;
  let vdf;
  let accounts;

  //    const inflationVote = 800000;
  //    const rewardVote = 20000;
  const inflationVote = 10;
  const rewardVote = 20000;

  const accountsBalances = [
    new BN('10000000000000000000000000'),
    new BN('50000000000000000000000000'),
    new BN('50000000000000000000000000'),
  ];
  const accountsSums = [
    new BN('0'),
    new BN('10000000000000000000000000'),
    new BN('60000000000000000000000000'),
  ];

  const totalSum = new BN('110000000000000000000000000');
  const amountOfAccounts = 3;
  let map;
  let timedPolicies;

  const hash = (x) => web3.utils.soliditySha3(
    { type: 'bytes32', value: x[0] },
    { type: 'address', value: x[1] },
    { type: 'address', value: x[2] },
  );

  async function configureInflationRootHash() {
    const events = await currencyTimer.queryFilter('NewInflationRootHashProposal');
    const event = events[events.length - 1];
    addressRootHashProposal = event.args.inflationRootHashProposalContract;
    tree = getTree(map);
    proposedRootHash = tree.hash;

    for (let i = 0; i < 3; i += 1) {
      eco
        .connect(accounts[i])
        .approve(addressRootHashProposal, await eco.balanceOf(await accounts[i].getAddress()));
    }

    rootHashProposal = await ethers.getContractAt(
      'InflationRootHashProposal',
      addressRootHashProposal,
    );
    await rootHashProposal
      .connect(accounts[0])
      .proposeRootHash(proposedRootHash, totalSum.toString(), amountOfAccounts);
    await time.increase(3600 * 25);
    await expect(rootHashProposal.checkRootHashStatus(await accounts[0].getAddress())).to.emit(
      rootHashProposal,
      'RootHashAccepted',
    );
  }

  function getRecipient(claimNumber) {
    if (toBN(claimNumber) === 0) {
      return [0, accounts[0]];
    }
    let index = accountsSums.findIndex((element) => element.gt(toBN(claimNumber)));
    index = index === -1 ? 2 : index - 1;
    return [index, accounts[index]];
  }

  async function getClaimParameters(inf, sequence) {
    const chosenClaimNumberHash = web3.utils.soliditySha3(
      {
        t: 'bytes32',
        v: await inf.seed(),
      },
      {
        t: 'uint256',
        v: sequence,
      },
    );
    const [index, recipient] = getRecipient(toBN(chosenClaimNumberHash).mod(toBN(totalSum)));
    return [answer(tree, index), index, recipient];
  }

  async function getPrimeDistance() {
    const baseNum = toBN(await time.latestBlockHash());

    for (let i = 0; i < 1000; i++) {
      if (await bigintCryptoUtils.isProbablyPrime(BigInt(baseNum.addn(i).toString()), 30)) {
        return i;
      }
    }
    await time.advanceBlock();
    return getPrimeDistance();
  }

  before(async () => {
    let comparableAccounts = await Promise.all(
      (await ethers.getSigners()).map(async (s) => [await s.getAddress(), s]),
    );
    comparableAccounts = comparableAccounts.sort((a, b) => a[0].localeCompare(b[0]));
    accounts = comparableAccounts.map((a) => a[1]);
    map = new Map([
      [await accounts[0].getAddress(), accountsBalances[0]],
      [await accounts[1].getAddress(), accountsBalances[1]],
      [await accounts[2].getAddress(), accountsBalances[2]],
    ]);
  });

  beforeEach(async () => {
    ({
      policy,
      eco,
      faucet: initInflation,
      timedPolicies,
      currencyTimer,
      inflation,
    } = await ecoFixture(await Promise.all(accounts.slice(1, 5).map(async (a) => a.getAddress()))));

    await initInflation.mint(await accounts[0].getAddress(), accountsBalances[0].toString());
    await initInflation.mint(await accounts[1].getAddress(), accountsBalances[1].toString());
    await initInflation.mint(await accounts[2].getAddress(), accountsBalances[2].toString());

    governance = await ethers.getContractAt(
      'CurrencyGovernance',
      await util.policyFor(policy, web3.utils.soliditySha3('CurrencyGovernance')),
    );

    const bob = accounts[1];
    const charlie = accounts[2];
    const dave = accounts[3];
    await governance.connect(bob).propose(inflationVote, rewardVote, 0, 0, '1000000000000000000');
    await time.increase(3600 * 24 * 10.1);

    const bobvote = [web3.utils.randomHex(32), await bob.getAddress(), [await bob.getAddress()]];
    await governance.connect(bob).commit(hash(bobvote));
    const charlievote = [
      web3.utils.randomHex(32),
      await charlie.getAddress(),
      [await bob.getAddress()],
    ];
    await governance.connect(charlie).commit(hash(charlievote));
    const davevote = [web3.utils.randomHex(32), await dave.getAddress(), [await bob.getAddress()]];
    await governance.connect(dave).commit(hash(davevote));
    await time.increase(3600 * 24 * 3);
    await governance.connect(bob).reveal(bobvote[0], bobvote[2]);
    await governance.connect(charlie).reveal(charlievote[0], charlievote[2]);
    await governance.connect(dave).reveal(davevote[0], davevote[2]);
    await time.increase(3600 * 24 * 1);
    await governance.updateStage();
    await governance.compute();
    await time.increase(3600 * 24 * 3);
    await timedPolicies.incrementGeneration();
    const events = await currencyTimer.queryFilter('NewInflation');
    const evt = events[events.length - 1];
    inflation = await ethers.getContractAt('RandomInflation', evt.args.addr);
    vdf = await ethers.getContractAt('VDFVerifier', await inflation.vdfVerifier());
    await configureInflationRootHash();
  });

  describe('startInflation', () => {
    it('reverts if startInflation is called with zero value _numRecipients', async () => {
      await expect(inflation.startInflation(0, 1)).to.be.revertedWith('Contract must have rewards');
    });

    it('reverts if startInflation is called with zero value _reward', async () => {
      await expect(inflation.startInflation(1, 0)).to.be.revertedWith('Contract must have rewards');
    });

    it('reverts if contract doesnt have the required funds to reward chosen recipients', async () => {
      await expect(inflation.startInflation(1000000000, 1000000000)).to.be.revertedWith(
        'The contract must have a token balance at least the total rewards',
      );
    });

    it('reverts if startInflation is called twice', async () => {
      await expect(inflation.startInflation(1, 1)).to.be.revertedWith(
        'The sale can only be started once',
      );
    });
  });

  describe('commitEntropyVDF', () => {
    it('emits the EntropyVDFSeedCommitted event', async () => {
      //      time.increase(3600 * 24 * 2);

      await expect(inflation.commitEntropyVDFSeed(await getPrimeDistance())).to.emit(
        inflation,
        'EntropyVDFSeedCommitted',
      );
    });

    it('reverts when called twice', async () => {
      //      time.increase(3600 * 24 * 2);

      await inflation.commitEntropyVDFSeed(await getPrimeDistance());

      await expect(inflation.commitEntropyVDFSeed(await getPrimeDistance())).to.be.revertedWith(
        'seed has already been set',
      );
    });
  });

  describe('submitEntropyVDF', () => {
    it('reverts when the seed has not been set', async () => {
      await expect(inflation.submitEntropyVDF(1)).to.be.revertedWith('seed must be set');
    });

    it("reverts when the VDF isn't proven", async () => {
      //      await time.increase(3600 * 24 * 2);

      await inflation.commitEntropyVDFSeed(await getPrimeDistance());

      await expect(inflation.submitEntropyVDF(1)).to.be.revertedWith(
        'output value must be verified',
      );
    });

    context('when correctly submitting a proven VDF', () => {
      let y;

      beforeEach(async () => {
        //        await time.increase(3600 * 24 * 2);

        await inflation.commitEntropyVDFSeed(await getPrimeDistance());
        let u;
        const vdfseed = toBN(await inflation.entropyVDFSeed());
        const t = await inflation.randomVDFDifficulty();
        [y, u] = prove(vdfseed, t);

        await vdf.start(bnHex(vdfseed), t, bnHex(y));
        for (let i = 0; i < u.length; i += 1) {
          await vdf.update(i + 1, bnHex(u[i]));
        }
      });

      it('emits the EntropySeedRevealed event', async () => {
        await expect(inflation.submitEntropyVDF(bnHex(y))).to.emit(
          inflation,
          'EntropySeedRevealed',
        );
      });

      it('reverts when submitted multiple times', async () => {
        await inflation.submitEntropyVDF(bnHex(y));

        await expect(inflation.submitEntropyVDF(bnHex(y))).to.be.revertedWith('only submit once');
      });
    });
  });

  describe('claim', () => {
    beforeEach(async () => {
      await inflation.commitEntropyVDFSeed(await getPrimeDistance());
    });

    context('but before the VDF is complete', () => {
      it('rejects any claims', async () => {
        const a = answer(tree, 0);
        await expect(
          inflation.connect(accounts[0]).claim(0, a[1].reverse(), a[0].sum.toString(), 0),
        ).to.be.revertedWith('Must prove VDF before claims can be paid');
      });
    });

    context('after the VDF is complete', () => {
      beforeEach(async () => {
        const vdfseed = toBN(await inflation.entropyVDFSeed());
        const t = await inflation.randomVDFDifficulty();
        const [y, u] = prove(vdfseed, t);

        await vdf.start(bnHex(vdfseed), t, bnHex(y));
        for (let i = 0; i < u.length; i += 1) {
          await vdf.update(i + 1, bnHex(u[i]));
        }
        await inflation.submitEntropyVDF(bnHex(y));
      });

      it('pays out inflation', async () => {
        const [a, index, recipient] = await getClaimParameters(inflation, 0);
        await expect(
          inflation.connect(recipient).claim(0, a[1].reverse(), a[0].sum.toString(), index),
        )
          .to.emit(inflation, 'Claimed')
          .withArgs(await recipient.getAddress(), 0);
      });

      it('emits the Claimed event', async () => {
        await time.increase(3600 * 24 * 10 + 1);
        const [a, index, recipient] = await getClaimParameters(inflation, 3);
        await expect(
          inflation.connect(recipient).claim(3, a[1].reverse(), a[0].sum.toString(), index),
        )
          .to.emit(inflation, 'Claimed')
          .withArgs(await recipient.getAddress(), 3);
      });

      context('reverts when called with a non-chosen claimNumber', async () => {
        it('sequence is not in numRecipients', async () => {
          const numRecipients = await inflation.numRecipients();
          const [a, index, recipient] = await getClaimParameters(inflation, 2);
          await expect(
            inflation
              .connect(recipient)
              .claim(numRecipients, a[1].reverse(), a[0].sum.toString(), index),
          ).to.be.revertedWith('The provided sequence number must be within the set of recipients');
        });

        it('fail root hash verification', async () => {
          const [a, index, recipient] = await getClaimParameters(inflation, 2);
          await expect(
            inflation
              .connect(recipient)
              .claim(0, a[1].reverse(), (a[0].sum + 1000000).toString(), index),
          ).to.be.revertedWith('A claim submission failed root hash verification');
        });
      });

      it('reverts when called for the next period', async () => {
        const [a, index, recipient] = await getClaimParameters(inflation, 1000);
        await expect(
          inflation.connect(recipient).claim(3, a[1].reverse(), a[0].sum.toString(), index),
        ).to.be.revertedWith('can only be made after enough time');
      });

      context('when already called this period', () => {
        beforeEach(async () => {
          const [a, index, recipient] = await getClaimParameters(inflation, 0);
          await inflation.connect(recipient).claim(0, a[1].reverse(), a[0].sum.toString(), index);
        });

        it('reverts', async () => {
          const [a, index, recipient] = await getClaimParameters(inflation, 0);
          await expect(
            inflation.connect(recipient).claim(0, a[1].reverse(), a[0].sum.toString(), index),
          ).to.be.revertedWith('claim can only be made if it has not already been made');
        });
      });

      context('after one inflation period', () => {
        const updatedMap = new Map();
        beforeEach(async () => {
          for (let i = 0; i < 3; i += 1) {
            updatedMap.set(
              await accounts[i].getAddress(),
              toBN(await eco.balanceOf(await accounts[i].getAddress())),
            );
          }
          const [a, index, recipient] = await getClaimParameters(inflation, 0);
          updatedMap.set(
            await recipient.getAddress(),
            updatedMap.get(await recipient.getAddress()).add(toBN(rewardVote)),
          );
          await inflation.connect(recipient).claim(0, a[1].reverse(), a[0].sum.toString(), index);
          await time.increase(3600 * 24 * 30);
        });

        it('pays out more inflation', async () => {
          for (let i = 1; i <= 9; i += 1) {
            const [a, index, recipient] = await getClaimParameters(inflation, i);
            updatedMap.set(
              await recipient.getAddress(),
              updatedMap.get(await recipient.getAddress()).add(toBN(rewardVote)),
            );
            await inflation.connect(recipient).claim(i, a[1].reverse(), a[0].sum.toString(), index);
            assert.equal(
              (await eco.balanceOf(await recipient.getAddress())).toString(),
              updatedMap.get(await recipient.getAddress()).toString(),
              'Should get an inflation',
            );
          }
        });
      });
    });
  });

  describe('destruct', () => {
    // I kind of just want to remove the destruct function.
    // I don't really think it does anything useful at this point.

    // context('before seed reveal', () => {
    //   it('reverts because the contract has a non-zero balance', async () => {
    //     await expectRevert(
    //       inflation.destruct(),
    //       'The contract must have 0 balance to be destructed prior seed revealing.',
    //     );
    //   });
    // });

    context('after the results are computed', () => {
      beforeEach(async () => {
        await inflation.commitEntropyVDFSeed(await getPrimeDistance());
      });

      context('with VDF, basic flow', () => {
        beforeEach(async () => {
          const vdfseed = toBN(await inflation.entropyVDFSeed());
          const t = await inflation.randomVDFDifficulty();
          const [y, u] = prove(vdfseed, t);

          await vdf.start(bnHex(vdfseed), t, bnHex(y));
          for (let i = 0; i < u.length; i += 1) {
            await vdf.update(i + 1, bnHex(u[i]));
          }
          await inflation.submitEntropyVDF(bnHex(y));
          const numRecipients = await inflation.numRecipients();
          for (let i = 0; i < numRecipients; i += 1) {
            await time.increase(3600 * 24 * 8 + 1);
            const [a, index, recipient] = await getClaimParameters(inflation, i);
            await inflation.connect(recipient).claim(i, a[1].reverse(), a[0].sum.toString(), index);
          }
        });

        it('succeeds', async () => {
          await inflation.destruct();
        });

        it('burns the minted tokens', async () => {
          await inflation.destruct();

          assert.equal((await eco.balanceOf(inflation.address)).toString(), 0);
        });
      });

      context('with a VDF solution', () => {
        beforeEach(async () => {
          const vdfseed = toBN(await inflation.entropyVDFSeed());
          const t = await inflation.randomVDFDifficulty();
          const [y, u] = prove(vdfseed, t);

          await vdf.start(bnHex(vdfseed), t, bnHex(y));
          for (let i = 0; i < u.length; i += 1) {
            await vdf.update(i + 1, bnHex(u[i]));
          }

          await inflation.submitEntropyVDF(bnHex(y));
        });

        context('and claimNumbers have not been paid out', () => {
          it('reverts', async () => {
            await expect(inflation.destruct()).to.be.revertedWith('rewards must be claimed prior');
          });

          context('after a long time', () => {
            beforeEach(async () => {
              await time.increase(3600 * 24 * 30);
            });

            it('still reverts', async () => {
              await expect(inflation.destruct()).to.be.revertedWith(
                'rewards must be claimed prior',
              );
            });
          });
        });

        context('and claimNumbers have been paid out', () => {
          beforeEach(async () => {
            await time.increase(3600 * 24 * 30);

            const numRecipients = (await inflation.numRecipients()).toNumber();

            await Promise.all(
              [accounts[0], accounts[1]].map(async () => {
                for (let i = 0; i < numRecipients; i += 1) {
                  try {
                    const [a, index, recipient] = await getClaimParameters(inflation, i);
                    await inflation
                      .connect(recipient)
                      .claim(i, a[1].reverse(), a[0].sum.toString(), index);
                  } catch (e) {
                    if (
                      !e.message.includes('provided address does not hold')
                      && !e.message.includes('not already been made')
                    ) {
                      throw e;
                    }
                  }
                }
              }),
            );
          });

          it('succeeds', async () => {
            await inflation.destruct();
          });

          context('after destructing', () => {
            beforeEach(async () => {
              await inflation.destruct();
            });

            it('has no leftover tokens', async () => {
              assert.equal((await eco.balanceOf(inflation.address)).toString(), 0);
            });

            it('is no longer the inflation policy', async () => {
              const govhash = web3.utils.soliditySha3('CurrencyGovernance');

              assert.notEqual(await util.policyFor(policy, govhash), inflation.address);
            });
          });
        });
      });
    });
  });
});
