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
  let balanceStore;
  let token;
  let initInflation;
  let policyVotes;
  let proposal;
  let proxiedPolicyVotes;
  let timedPolicies;

  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];
  const dave = accounts[3];
  const frank = accounts[4];
  let counter = 0;

  beforeEach(async () => {
    ({
      policy,
      balanceStore,
      token,
      initInflation,
      timedPolicies,
    } = await util.deployPolicy(accounts[counter]));
    counter++;

    await initInflation.mint(balanceStore.address, alice, toBN(10).pow(toBN(18)).muln(5000));
    await initInflation.mint(balanceStore.address, bob, toBN(10).pow(toBN(18)).muln(5000));
    await initInflation.mint(balanceStore.address, charlie, toBN(10).pow(toBN(18)).muln(5000));
    await initInflation.mint(balanceStore.address, dave, toBN(10).pow(toBN(18)).muln(5000));
    await time.increase(3600 * 24 * 40);
    await timedPolicies.incrementGeneration();

    policyVotes = await PolicyVotes.new(policy.address);
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
          await proxiedPolicyVotes.configure(proposal);
        });

        it('sets the veto end time', async () => {
          await proxiedPolicyVotes.configure(proposal);

          assert.notEqual(
            (await proxiedPolicyVotes.voteEnds()).toString(),
            0,
          );
        });
      });

      context('that has already been configured', () => {
        beforeEach(async () => {
          await proxiedPolicyVotes.configure(proposal);
        });

        it('reverts', async () => {
          await expectRevert(
            proxiedPolicyVotes.configure(proposal),
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
        await proxiedPolicyVotes.configure(proposal);
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
            const tx = await proxiedPolicyVotes.vote(true);
            await expectEvent.inLogs(tx.logs, 'PolicyVoteCast');
          });

          it('increases the total stake', async () => {
            const startStake = await proxiedPolicyVotes.totalStake();

            await proxiedPolicyVotes.vote(true);

            assert(
              startStake.add(await token.balanceOf(alice))
                .eq(await proxiedPolicyVotes.totalStake()),
            );
          });

          it('increases the yes stake on yes', async () => {
            const startStake = await proxiedPolicyVotes.yesStake();

            await proxiedPolicyVotes.vote(true);

            expect(
              await proxiedPolicyVotes.yesStake(),
            ).to.eq.BN(startStake.add(await token.balanceOf(alice)));
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
              ).to.eq.BN(startStake.sub(await token.balanceOf(alice)));
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
              ).to.eq.BN(startStake.add(await token.balanceOf(alice)));
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
      await proxiedPolicyVotes.configure(proposal);
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
          true,
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
            { from: bob },
          );
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
