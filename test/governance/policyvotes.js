const PolicyVotes = artifacts.require('PolicyVotes');
const SampleHandler = artifacts.require('SampleHandler');
const SampleProposal = artifacts.require('SampleProposal');
const ForwardProxy = artifacts.require('ForwardProxy');
const { expectEvent, expectRevert, time } = require('@openzeppelin/test-helpers');

const chai = require('chai');

const { BN, toBN } = web3.utils;
const bnChai = require('bn-chai');
const util = require('../../tools/test/util');

const { expect } = chai;

chai.use(bnChai(BN));

contract('PolicyVotes [@group=8]', (accounts) => {
  let policy;
  let eco;
  let ecox;
  let initInflation;
  let policyVotes;
  let proposal;
  let proxiedPolicyVotes;
  let timedPolicies;
  const one = toBN(10).pow(toBN(18));

  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];
  const dave = accounts[3];
  const frank = accounts[4];
  let counter = 0;

  beforeEach(async () => {
    ({
      policy,
      eco,
      initInflation,
      timedPolicies,
      ecox,
    } = await util.deployPolicy(accounts[counter]));
    counter++;

    await initInflation.mint(eco.address, alice, one.muln(5000));
    await initInflation.mint(eco.address, bob, one.muln(5000));
    await initInflation.mint(eco.address, charlie, one.muln(5200));
    await initInflation.mint(eco.address, dave, one.muln(4800));
    await time.increase(3600 * 24 * 40);
    await timedPolicies.incrementGeneration();

    policyVotes = await PolicyVotes.new(policy.address, eco.address, ecox.address);
    proposal = (await SampleProposal.new(0)).address;
    const proxy = await ForwardProxy.new(policyVotes.address);
    proxiedPolicyVotes = await PolicyVotes.at(proxy.address);
    await policy.testDirectSet('PolicyVotes', proxiedPolicyVotes.address);
  });

  // describe('initialize', () => {
  //   it('can be proxied', async () => {
  //     await ForwardProxy.new(policyVotes.address);
  //   });
  // });

  describe('configure', () => {
    context('when called on a proxied instance', () => {
      context('that has not been configured', () => {
        it('succeeds', async () => {
          await proxiedPolicyVotes.configure(proposal, (await time.latestBlock()));
        });

        it('sets the veto end time', async () => {
          await proxiedPolicyVotes.configure(proposal, (await time.latestBlock()));

          assert.notEqual(
            (await proxiedPolicyVotes.voteEnds()).toString(),
            0,
          );
        });
      });

      context('that has already been configured', () => {
        beforeEach(async () => {
          await proxiedPolicyVotes.configure(proposal, (await time.latestBlock()));
        });

        it('reverts', async () => {
          await expectRevert(
            proxiedPolicyVotes.configure(proposal, (await time.latestBlock())),
            'has already been configured',
          );
        });
      });
    });
  });

  describe('vote', () => {
    context('before the contract is configured', () => {
      it('reverts', async () => {
        await expectRevert(
          proxiedPolicyVotes.vote(true),
          'Votes can only be recorded during the voting period',
        );
      });
    });

    context('when the contract is configured', () => {
      beforeEach(async () => {
        await proxiedPolicyVotes.configure(proposal, (await time.latestBlock()));
      });

      context('after the commitment period', () => {
        beforeEach(async () => {
          await time.increase(3600 * 24 * 22);
        });

        it('reverts', async () => {
          await expectRevert(
            proxiedPolicyVotes.vote(true),
            'Votes can only be recorded during the voting period',
          );
        });
      });

      context('during the commitment period', () => {
        context('with no tokens', () => {
          it('reverts', async () => {
            await expectRevert(
              proxiedPolicyVotes.vote(true, { from: frank }),
              'must have held tokens',
            );
          });
        });

        context('with tokens', () => {
          it('can vote', async () => {
            const tx = await proxiedPolicyVotes.vote(true, { from: alice });
            await expectEvent.inTransaction(
              tx.tx,
              policyVotes.constructor,
              'PolicyVoteCast',
              { voter: alice, vote: true, amount: one.muln(5000).toString() },
            );
          });

          it('increases the total stake', async () => {
            const startStake = await proxiedPolicyVotes.totalStake();

            await proxiedPolicyVotes.vote(true);

            assert(
              startStake.add(await eco.balanceOf(alice))
                .eq(await proxiedPolicyVotes.totalStake()),
            );
          });

          it('increases the yes stake on yes', async () => {
            const startStake = await proxiedPolicyVotes.yesStake();

            await proxiedPolicyVotes.vote(true);

            expect(
              await proxiedPolicyVotes.yesStake(),
            ).to.eq.BN(startStake.add(await eco.balanceOf(alice)));
          });

          it('does not increas the yes stake on no', async () => {
            const startStake = await proxiedPolicyVotes.yesStake();

            await proxiedPolicyVotes.vote(false);

            expect(await proxiedPolicyVotes.yesStake()).to.eq.BN(startStake);
          });

          context('with an existing yes vote', () => {
            beforeEach(async () => {
              await proxiedPolicyVotes.vote(true);
            });

            it('does not increase total stake', async () => {
              const startStake = await proxiedPolicyVotes.totalStake();

              await proxiedPolicyVotes.vote(false);

              expect(await proxiedPolicyVotes.totalStake()).to.eq.BN(startStake);
            });

            it('decreases yes stake', async () => {
              const startStake = await proxiedPolicyVotes.yesStake();

              await proxiedPolicyVotes.vote(false);

              expect(
                await proxiedPolicyVotes.yesStake(),
              ).to.eq.BN(startStake.sub(await eco.balanceOf(alice)));
            });
          });

          context('with an existing no vote', () => {
            beforeEach(async () => {
              await proxiedPolicyVotes.vote(false);
            });

            it('does not increase total stake', async () => {
              const startStake = await proxiedPolicyVotes.totalStake();

              await proxiedPolicyVotes.vote(true);

              expect(await proxiedPolicyVotes.totalStake()).to.eq.BN(startStake);
            });

            it('increases yes stake', async () => {
              const startStake = await proxiedPolicyVotes.yesStake();

              await proxiedPolicyVotes.vote(true);

              expect(
                await proxiedPolicyVotes.yesStake(),
              ).to.eq.BN(startStake.add(await eco.balanceOf(alice)));
            });
          });
        });
      });
    });
  });

  describe('voteSplit', () => {
    context('before the contract is configured', () => {
      it('reverts', async () => {
        await expectRevert(
          proxiedPolicyVotes.voteSplit(1, 1),
          'Votes can only be recorded during the voting period',
        );
      });
    });

    context('when the contract is configured', () => {
      beforeEach(async () => {
        await proxiedPolicyVotes.configure(proposal, (await time.latestBlock()));
      });

      context('after the commitment period', () => {
        beforeEach(async () => {
          await time.increase(3600 * 24 * 22);
        });

        it('reverts', async () => {
          await expectRevert(
            proxiedPolicyVotes.voteSplit(1, 1),
            'Votes can only be recorded during the voting period',
          );
        });
      });

      context('during the commitment period', () => {
        context('with no tokens', () => {
          it('reverts', async () => {
            await expectRevert(
              proxiedPolicyVotes.voteSplit(0, 0, { from: frank }),
              'must have held tokens',
            );
          });
        });

        context('with tokens', () => {
          it('can vote', async () => {
            const tx = await proxiedPolicyVotes.voteSplit(42, 1101);
            await expectEvent.inTransaction(
              tx.tx,
              policyVotes.constructor,
              'PolicySplitVoteCast',
              { voter: alice, votesYes: '42', votesNo: '1101' },
            );
          });

          it('cannot vote more than owned', async () => {
            await expectRevert(
              proxiedPolicyVotes.voteSplit(one.muln(5000), one.muln(3000)),
              'Your voting power is less than submitted yes + no votes',
            );
          });

          describe('increases the total stake', () => {
            it('when the whole balance is voted', async () => {
              const startStake = await proxiedPolicyVotes.totalStake();

              await proxiedPolicyVotes.voteSplit(one.muln(2000), one.muln(3000));

              assert(
                startStake.add(await eco.balanceOf(alice))
                  .eq(await proxiedPolicyVotes.totalStake()),
              );
            });

            it('when some of the balance is voted', async () => {
              const startStake = await proxiedPolicyVotes.totalStake();

              await proxiedPolicyVotes.voteSplit(one.muln(1500), one.muln(200));

              assert(
                startStake.add(one.muln(1700))
                  .eq(await proxiedPolicyVotes.totalStake()),
              );
            });
          });

          it('increases the yes stake on yes', async () => {
            const startStake = await proxiedPolicyVotes.yesStake();

            await proxiedPolicyVotes.voteSplit(one.muln(1500), one.muln(200));

            expect(
              await proxiedPolicyVotes.yesStake(),
            ).to.eq.BN(startStake.add(one.muln(1500)));
          });

          context('with an existing vote and the same total', () => {
            beforeEach(async () => {
              await proxiedPolicyVotes.voteSplit(one.muln(1500), one.muln(200));
            });

            it('does not increase total stake', async () => {
              const startStake = await proxiedPolicyVotes.totalStake();

              await proxiedPolicyVotes.voteSplit(one.muln(1000), one.muln(700));

              expect(await proxiedPolicyVotes.totalStake()).to.eq.BN(startStake);
            });

            it('decreases yes stake', async () => {
              const startStake = await proxiedPolicyVotes.yesStake();

              await proxiedPolicyVotes.voteSplit(one.muln(1000), one.muln(700));

              expect(
                await proxiedPolicyVotes.yesStake(),
              ).to.eq.BN(startStake.sub(one.muln(500)));
            });
          });

          context('with an existing vote and different total', () => {
            beforeEach(async () => {
              await proxiedPolicyVotes.voteSplit(one.muln(1500), one.muln(200));
            });

            it('correctly increases total stake', async () => {
              const startStake = await proxiedPolicyVotes.totalStake();

              await proxiedPolicyVotes.voteSplit(one.muln(2500), one.muln(1200));

              expect(
                await proxiedPolicyVotes.totalStake(),
              ).to.eq.BN(startStake.add(one.muln(2000)));
            });

            it('correctly increases yes stake', async () => {
              const startStake = await proxiedPolicyVotes.yesStake();

              await proxiedPolicyVotes.voteSplit(one.muln(2500), one.muln(1200));

              expect(
                await proxiedPolicyVotes.yesStake(),
              ).to.eq.BN(startStake.add(one.muln(1000)));
            });
          });

          context('vote -> voteSplit', () => {
            beforeEach(async () => {
              await proxiedPolicyVotes.vote(true);
            });

            it('correctly decreases total stake', async () => {
              const startStake = await proxiedPolicyVotes.totalStake();

              await proxiedPolicyVotes.voteSplit(one.muln(2500), one.muln(1200));

              expect(
                await proxiedPolicyVotes.totalStake(),
              ).to.eq.BN(startStake.sub(one.muln(1300)));
            });

            it('correctly decreases yes stake', async () => {
              const startStake = await proxiedPolicyVotes.yesStake();

              await proxiedPolicyVotes.voteSplit(one.muln(2500), one.muln(1200));

              expect(
                await proxiedPolicyVotes.yesStake(),
              ).to.eq.BN(startStake.sub(one.muln(2500)));
            });
          });

          context('voteSplit -> vote', () => {
            beforeEach(async () => {
              await proxiedPolicyVotes.voteSplit(one.muln(1500), one.muln(200));
            });

            it('correctly increases total stake', async () => {
              const startStake = await proxiedPolicyVotes.totalStake();

              await proxiedPolicyVotes.vote(true);

              expect(
                await proxiedPolicyVotes.totalStake(),
              ).to.eq.BN(startStake.add(one.muln(3300)));
            });

            it('correctly increases yes stake on yes', async () => {
              const startStake = await proxiedPolicyVotes.yesStake();

              await proxiedPolicyVotes.vote(true);

              expect(
                await proxiedPolicyVotes.yesStake(),
              ).to.eq.BN(startStake.add(one.muln(3500)));
            });

            it('correctly decreases yes stake on no', async () => {
              const startStake = await proxiedPolicyVotes.yesStake();

              await proxiedPolicyVotes.vote(false);

              expect(
                await proxiedPolicyVotes.yesStake(),
              ).to.eq.BN(startStake.sub(one.muln(1500)));
            });
          });
        });
      });
    });
  });

  describe('execute', () => {
    const adoptedPolicyIdHash = web3.utils.soliditySha3('TestSample');
    const votesPolicyIdHash = web3.utils.soliditySha3('PolicyVotes');

    beforeEach(async () => {
      await proxiedPolicyVotes.configure(proposal, (await time.latestBlock()));
    });

    context('when no one votes', () => {
      it('fails', async () => {
        await time.increase(3600 * 24 * 4.1);
        const tx = await proxiedPolicyVotes.execute();
        await expectEvent.inLogs(tx.logs, 'VoteCompleted', { result: '2' });
      });
    });

    context('with votes', () => {
      beforeEach(async () => {
        await proxiedPolicyVotes.vote(
          true,
          { from: charlie },
        );

        await proxiedPolicyVotes.vote(
          false,
          { from: dave },
        );
      });

      context('called on a non-proxied instance', () => {
        it('reverts', async () => {
          await expectRevert(
            policyVotes.execute(),
            'revert',
          );
        });
      });

      context('when called early, without majority support', () => {
        it('reverts', async () => {
          await expectRevert(
            proxiedPolicyVotes.execute(),
            'Majority support required for early enaction',
          );
        });
      });

      context('when called after the delay, with plurality support', () => {
        it('succeeds', async () => {
          await time.increase(3600 * 24 * 4.1);

          const tx = await proxiedPolicyVotes.execute();
          await expectEvent.inLogs(tx.logs, 'VoteCompleted', { result: '0' });
        });
      });

      context('when called early with majority of total stake', () => {
        it('succeeds', async () => {
          await proxiedPolicyVotes.vote(
            true,
            { from: bob },
          );

          const tx = await proxiedPolicyVotes.execute();
          await expectEvent.inLogs(tx.logs, 'VoteCompleted', { result: '0' });
        });
      });

      context('is not PolicyVotes', () => {
        it('reverts', async () => {
          await policy.testDirectSet('PolicyVotes', policy.address);
          await time.increase(3600 * 24 * 4.1);
          await expectRevert(
            proxiedPolicyVotes.execute(),
            'This contract no longer has authorization to enact the vote',
          );
        });
      });

      context('when no policy wins', () => {
        let tx;
        beforeEach(async () => {
          await proxiedPolicyVotes.vote(
            false,
            { from: alice },
          );
          await time.increase(3600 * 24 * 4.1);

          tx = await proxiedPolicyVotes.execute();
        });

        it('does not enact the policies', async () => {
          assert.equal(
            await util.policyFor(policy, adoptedPolicyIdHash),
            0,
          );
        });

        it('removes itself from the PolicyVotes role', async () => {
          assert.equal(
            await util.policyFor(policy, votesPolicyIdHash),
            0,
          );
        });

        it('emits the VoteCompleted event', async () => {
          await expectEvent.inLogs(tx.logs, 'VoteCompleted', { result: '1' });
        });
      });

      context('when proposal wins', () => {
        let tx;
        beforeEach(async () => {
          await proxiedPolicyVotes.vote(
            true,
            { from: bob },
          );

          tx = await proxiedPolicyVotes.execute();
        });

        it('adopts policy 0', async () => {
          const newPolicy = await SampleHandler.at(
            await util.policyFor(
              policy,
              adoptedPolicyIdHash,
            ),
          );
          assert.equal((await newPolicy.id()).toString(), 0);
        });

        it('removes itself from the PolicyVotes role', async () => {
          assert.equal(
            await util.policyFor(policy, votesPolicyIdHash),
            0,
          );
        });

        it('emits the VoteCompleted event', async () => {
          await expectEvent.inLogs(tx.logs, 'VoteCompleted', { result: '0' });
        });
      });
    });
  });
});
