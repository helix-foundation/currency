/* eslint-disable no-underscore-dangle */
/* eslint-disable no-await-in-loop */

const CurrencyGovernance = artifacts.require('CurrencyGovernance');
const Inflation = artifacts.require('Inflation');
const VDFVerifier = artifacts.require('VDFVerifier');
const InflationRootHashProposal = artifacts.require('InflationRootHashProposal');

const {
  toBN,
  BN,
} = web3.utils;
const {
  expectEvent,
  expectRevert,
  time,
} = require('@openzeppelin/test-helpers');

const util = require('../../tools/test/util.js');
const {
  prove,
  bnHex,
} = require('../../tools/vdf.js');
const {
  getTree,
  answer,
} = require('../../tools/ticketlessInflationUtils.js');

contract('Inflation [@group=3]', (unsortedAccounts) => {
  let policy;
  let token;
  let balanceStore;
  let originalInflation;
  let governance;
  let initInflation;
  let addressRootHashProposal;
  let tree;
  let proposedRootHash;
  let rootHashProposal;
  let inflation;
  let currencyTimer;
  let vdf;

  //    const inflationVote = 800000;
  //    const prizeVote = 20000;
  const inflationVote = 10;
  const prizeVote = 20000;

  const accounts = Array.from(unsortedAccounts);
  accounts.sort((a, b) => Number(a - b));
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
  const map = new Map([
    [accounts[0], accountsBalances[0]],
    [accounts[1], accountsBalances[1]],
    [accounts[2], accountsBalances[2]],
  ]);
  let timedPolicies;

  const hash = (x) => web3.utils.soliditySha3(
    { type: 'bytes32', value: x[0] },
    { type: 'address', value: x[1] },
    { type: 'address', value: x[2] },
  );

  async function configureInflationRootHash() {
    //   await time.increase(3600 * 24 * 40);
    //   await timedPolicies.incrementGeneration();
    addressRootHashProposal = (await (new web3.eth.Contract(balanceStore.abi, balanceStore
      .address)).getPastEvents('allEvents', {
      fromBlock: 'latest',
      toBlock: 'latest',
    }))[0].returnValues.inflationRootHashProposalContract;
    tree = getTree(map);
    proposedRootHash = tree.hash;

    for (let i = 0; i < 3; i += 1) {
      token.approve(addressRootHashProposal, await balanceStore.balance(accounts[i]), {
        from: accounts[i],
      });
    }

    rootHashProposal = await InflationRootHashProposal.at(addressRootHashProposal);
    await rootHashProposal.proposeRootHash(proposedRootHash, totalSum,
      amountOfAccounts, {
        from: accounts[0],
      });
    await time.increase(3600 * 25);
    await expectEvent.inTransaction(
      (await rootHashProposal.checkRootHashStatus(accounts[0], proposedRootHash)).tx,
      InflationRootHashProposal,
      'RootHashAccepted',
    );
  }

  function getWinner(ticket) {
    if (toBN(ticket) === 0) {
      return [0, accounts[0]];
    }
    let index = accountsSums.findIndex((element) => element.gt(toBN(ticket)));
    index = index === -1 ? 2 : index - 1;
    return [index, accounts[index]];
  }

  async function getClaimParameters(inf, sequence) {
    const winningTicketHash = web3.utils.soliditySha3({
      t: 'bytes32',
      v: await inf.seed(),
    }, {
      t: 'uint256',
      v: sequence,
    });
    const [index, winner] = getWinner(toBN(winningTicketHash).mod(toBN(totalSum)));
    return [answer(tree, index), index, winner];
  }

  beforeEach(async () => {
    ({
      policy,
      balanceStore,
      token,
      initInflation,
      timedPolicies,
      currencyTimer,
      inflation,
    } = await util.deployPolicy({ trustees: accounts.slice(1, 5) }));

    originalInflation = inflation;

    await initInflation.mint(balanceStore.address, accounts[0], accountsBalances[0]);
    await initInflation.mint(balanceStore.address, accounts[1], accountsBalances[1]);
    await initInflation.mint(balanceStore.address, accounts[2], accountsBalances[2]);

    //    await configureInflationRootHash();
    await Promise.all([0, 1, 2].map((id) => balanceStore.update(accounts[id])));

    governance = await CurrencyGovernance.at(
      await util.policyFor(policy, await timedPolicies.ID_CURRENCY_GOVERNANCE()),
    );

    const bob = accounts[1];
    await governance.propose(inflationVote, prizeVote, 0, 0, { from: bob });
    await time.increase(3600 * 24 * 10.1);

    const bobvote = [web3.utils.randomHex(32), bob, [bob]];
    await governance.commit(hash(bobvote), { from: bob });
    await time.increase(3600 * 24 * 3);
    await governance.reveal(bobvote[0], bobvote[2], { from: bob });
    await time.increase(3600 * 24 * 1);
    await governance.updateStage();
    await governance.compute();
    await time.increase(3600 * 24 * 3);
    await timedPolicies.incrementGeneration();
    const [evt] = await currencyTimer.getPastEvents('InflationStarted');
    inflation = await Inflation.at(evt.args.addr);
    vdf = await VDFVerifier.at(await inflation.vdfVerifier());
    await configureInflationRootHash();
  });

  describe('commitEntropyVDF', () => {
    it('emits the EntropyVDFSeedCommitted event', async () => {
      //      time.increase(3600 * 24 * 2);

      const tx = await inflation.commitEntropyVDFSeed();

      await expectEvent.inTransaction(
        tx.tx,
        inflation.constructor,
        'EntropyVDFSeedCommitted',
      );
    });

    it('reverts when called twice', async () => {
      //      time.increase(3600 * 24 * 2);

      await inflation.commitEntropyVDFSeed();

      await expectRevert(
        inflation.commitEntropyVDFSeed(),
        'seed has already been set',
      );
    });
  });

  describe('submitEntropyVDF', () => {
    it('reverts when the seed has not been set', async () => {
      await expectRevert(
        inflation.submitEntropyVDF(bnHex(toBN(1))),
        'seed must be set',
      );
    });

    it('reverts when the VDF isn\'t proven', async () => {
      //      await time.increase(3600 * 24 * 2);

      await inflation.commitEntropyVDFSeed();

      await expectRevert(
        inflation.submitEntropyVDF(bnHex(toBN(1))),
        'output value must be verified',
      );
    });

    context('when correctly submitting a proven VDF', () => {
      let y;

      beforeEach(async () => {
        //        await time.increase(3600 * 24 * 2);

        await inflation.commitEntropyVDFSeed();
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
        const tx = await inflation.submitEntropyVDF(bnHex(y));

        await expectEvent.inTransaction(
          tx.tx,
          inflation.constructor,
          'EntropySeedRevealed',
        );
      });

      it('reverts when submitted multiple times', async () => {
        await inflation.submitEntropyVDF(bnHex(y));

        await expectRevert(
          inflation.submitEntropyVDF(bnHex(y)),
          'only submit once',
        );
      });
    });
  });

  describe('claim', () => {
    beforeEach(async () => {
      await inflation.commitEntropyVDFSeed();
    });

    context('but before the VDF is complete', () => {
      it('rejects any claims', async () => {
        const a = answer(tree, 0);
        await expectRevert(
          inflation.claim(0, a[1].reverse(), toBN(a[0].sum), 0, {
            from: accounts[0],
          }),
          'Must prove VDF before claims can be paid',
        );
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
        const [a, index, winner] = await getClaimParameters(inflation, 0);
        await expectEvent.inTransaction(
          (await inflation.claim(0, a[1].reverse(), toBN(a[0].sum), index, {
            from: winner,
          })).tx,
          inflation.constructor,
          'Claimed', {
            who: winner.toString(),
            sequence: '0',
          },
        );
      });

      it('emits the Claimed event', async () => {
        await time.increase(3600 * 24 * 10 + 1);
        const [a, index, winner] = await getClaimParameters(inflation, 3);
        const tx = await inflation.claim(3, a[1].reverse(),
          toBN(a[0].sum), index, {
            from: winner,
          });
        await expectEvent.inTransaction(tx.tx, inflation.constructor,
          'Claimed', {
            who: winner,
            sequence: '3',
          });
      });

      it('reverts when called with a non-winning ticket', async () => {
        const winners = await inflation.winners();
        const [a, index, winner] = await getClaimParameters(inflation, 2);
        await expectRevert(
          inflation.claim(winners, a[1].reverse(), toBN(a[0].sum), index, {
            from: winner,
          }),
          'must be within the set of winners',
        );
      });

      it('reverts when called for the next period', async () => {
        const [a, index, winner] = await getClaimParameters(inflation, 1000);
        await expectRevert(
          inflation.claim(3, a[1].reverse(), toBN(a[0].sum), index, {
            from: winner,
          }),
          'can only be made after enough time',
        );
      });

      context('when already called this period', () => {
        beforeEach(async () => {
          const [a, index, winner] = await getClaimParameters(inflation, 0);
          await inflation.claim(0, a[1].reverse(), toBN(a[0].sum), index, {
            from: winner,
          });
        });

        it('reverts', async () => {
          const [a, index, winner] = await getClaimParameters(inflation, 0);
          await expectRevert(
            inflation.claim(0, a[1].reverse(), toBN(a[0].sum), index, {
              from: winner,
            }),
            'claim can only be made if it has not already been made',
          );
        });
      });

      context('after one inflation period', () => {
        const updatedMap = new Map();
        beforeEach(async () => {
          for (let i = 0; i < 3; i += 1) {
            updatedMap.set(accounts[i], await token.balanceOf.call(accounts[
              i]));
          }
          const [a, index, winner] = await getClaimParameters(inflation, 0);
          updatedMap.set(winner, updatedMap.get(winner).add(toBN(prizeVote)));
          await inflation.claim(0, a[1].reverse(), toBN(a[0].sum), index, {
            from: winner,
          });
          await time.increase(3600 * 24 * 30);
        });

        it('pays out more inflation', async () => {
          for (let i = 1; i <= 9; i += 1) {
            const [a, index, winner] = await getClaimParameters(inflation, i);
            updatedMap.set(winner, updatedMap.get(winner).add(toBN(
              prizeVote,
            )));
            await inflation.claim(i, a[1].reverse(), toBN(a[0].sum), index, {
              from: winner,
            });
            assert.equal(
              (await token.balanceOf.call(winner)).toString(),
              updatedMap.get(winner).toString(),
              'Should get an inflation',
            );
          }
        });
      });
    });
  });

  describe('destruct', () => {
    context('the base implementation', () => {
      it('reverts', async () => {
        await expectRevert(
          originalInflation.destruct(),
          'This method can only be called on clones',
        );
      });
    });

    context('after the results are computed', () => {
      beforeEach(async () => {
        await inflation.commitEntropyVDFSeed();
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
          const winners = await inflation.winners();
          for (let i = 0; i < winners; i += 1) {
            await time.increase(3600 * 24 * 8 + 1);
            const [a, index, winner] = await getClaimParameters(inflation, i);
            await inflation.claim(i, a[1].reverse(), toBN(a[0].sum), index, {
              from: winner,
            });
          }
        });

        it('succeeds', async () => {
          await inflation.destruct();
        });

        it('burns the minted tokens', async () => {
          await inflation.destruct();

          assert.equal(
            (await token.balanceOf(inflation.address)).toString(),
            0,
          );
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

        context('and tickets have not been paid out', () => {
          it('reverts', async () => {
            await expectRevert(
              inflation.destruct(),
              'winnings must be claimed prior',
            );
          });

          context('after a long time', () => {
            beforeEach(async () => {
              await time.increase(3600 * 24 * 30);
            });

            it('still reverts', async () => {
              await expectRevert(
                inflation.destruct(),
                'winnings must be claimed prior',
              );
            });
          });
        });

        context('and tickets have been paid out', () => {
          beforeEach(async () => {
            await time.increase(3600 * 24 * 30);

            const winners = (await inflation.winners()).toNumber();

            await Promise.all([accounts[0], accounts[1]].map(async () => {
              for (let i = 0; i < winners; i += 1) {
                try {
                  const [a, index, winner] = await getClaimParameters(inflation, i);
                  await inflation.claim(i, a[1].reverse(), toBN(a[
                    0].sum), index, {
                    from: winner,
                  });
                } catch (e) {
                  if (!e.message.includes(
                    'provided address does not hold',
                  )
                    && !e.message.includes(
                      'not already been made',
                    )) {
                    throw e;
                  }
                }
              }
            }));
          });

          it('succeeds', async () => {
            await inflation.destruct();
          });

          context('after destructing', () => {
            beforeEach(async () => {
              await inflation.destruct();
            });

            it('has no leftover tokens', async () => {
              assert.equal(
                (await token.balanceOf(inflation.address))
                  .toString(),
                0,
              );
            });

            it('is no longer the inflation policy', async () => {
              const govhash = web3.utils.soliditySha3(
                'CurrencyGovernance',
              );

              assert.notEqual(
                await util.policyFor(policy, govhash),
                inflation.address,
              );
            });
          });
        });
      });
    });
  });
});
