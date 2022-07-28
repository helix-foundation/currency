/* eslint-disable no-underscore-dangle, no-console */
const { expect } = require('chai');

const { ethers } = require('hardhat');

const { BigNumber } = ethers;
const { ecoFixture } = require('../utils/fixtures');

const time = require('../utils/time');
const { deploy } = require('../utils/contracts');

describe('CurrencyGovernance [@group=4]', () => {
  let alice;
  let bob;
  let charlie;
  let dave;
  let additionalTrustees = [];
  let policy;
  let borda;
  let trustedNodes = [];
  let faucet;
  let ecox;
  let timedPolicies;

  const hash = (x) => ethers.utils.solidityKeccak256(
    ['bytes32', 'address', 'address[]'],
    [x[0], x[1], x[2]],
  );

  const votingReward = '1000000000000000';
  // 76000000000000000

  before(async () => {
    const accounts = await ethers.getSigners();
    [alice, bob, charlie, dave] = accounts;
    additionalTrustees = accounts.slice(4, 11);
  });

  context('3 trustees', () => {
    beforeEach(async () => {
      const trustednodes = [
        await bob.getAddress(),
        await charlie.getAddress(),
        await dave.getAddress(),
      ];

      ({
        policy, trustedNodes, faucet, ecox, timedPolicies,
      } = await ecoFixture(trustednodes, votingReward));

      const originalBorda = await deploy('CurrencyGovernance', policy.address);
      const bordaCloner = await deploy('Cloner', originalBorda.address);
      borda = await ethers.getContractAt('CurrencyGovernance', await bordaCloner.clone());
      // console.log(borda.address);
      await policy.testDirectSet('CurrencyGovernance', borda.address);
    });

    describe('Propose phase', () => {
      it("Doesn't allow non-trustee to propose", async () => {
        await expect(
          borda.propose(33, 34, 35, 36, BigNumber.from('1000000000000000000'), ''),
        ).to.be.revertedWith('Only trusted nodes can call this method');
      });

      it('reverts if description is too long, doesnt if not', async () => {
        const a = 'a';
        const maxString = a.repeat(160);
        await expect(
          borda.connect(bob).propose(33, 34, 35, 36, BigNumber.from('1000000000000000000'), `${maxString}!`),
        ).to.be.revertedWith('Description is too long.');

        await borda.connect(bob).propose(33, 34, 35, 36, BigNumber.from('1000000000000000000'), maxString);
      });

      it('Allows trustees to propose', async () => {
        await borda.connect(bob).propose(33, 34, 35, 36, BigNumber.from('1000000000000000000'), '');

        const p = await borda.proposals(await bob.getAddress());
        expect(p.inflationMultiplier).to.equal('1000000000000000000');
        expect(p.numberOfRecipients).to.equal(33);
      });

      it('Allows for generation to increment if CurrencyGovernance is abandoned', async () => {
        await time.increase(3600 * 24 * 14.1);
        await timedPolicies.incrementGeneration();
      });

      it("Doesn't allow voting yet", async () => {
        await expect(borda.connect(bob).commit(ethers.utils.randomBytes(32))).to.be.revertedWith(
          'This call is not allowed at this stage',
        );
      });

      it('Allows removing proposals', async () => {
        await borda.connect(bob).propose(33, 34, 35, 36, BigNumber.from('1000000000000000000'), '');
        await borda.connect(bob).unpropose();

        const p = await borda.proposals(await bob.getAddress());
        expect(p.inflationMultiplier).to.equal(0);
      });

      it('Emits ProposalCreation event when proposal is created', async () => {
        await borda.connect(bob).propose(33, 34, 35, 36, BigNumber.from('1000000000000000000'), '');
        const [evt] = await borda.queryFilter('ProposalCreation');
        expect(evt.args.trusteeAddress).to.equal(await bob.getAddress());
        expect(evt.args._numberOfRecipients).to.equal(33);
        expect(evt.args._randomInflationReward).to.equal(34);
        expect(evt.args._lockupDuration).to.equal(35);
        expect(evt.args._lockupInterest).to.equal(36);
        expect(evt.args._inflationMultiplier).to.equal('1000000000000000000');
      });
    });

    describe('Voting phase', () => {
      beforeEach(async () => {
        await borda.connect(dave).propose(10, 10, 10, 10, BigNumber.from('1000000000000000000'), '');
        await borda.connect(charlie).propose(20, 20, 20, 20, BigNumber.from('1000000000000000000'), '');
        await borda.connect(bob).propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'), '');
        await time.increase(3600 * 24 * 10.1);
      });

      it('Emits VoteStart when stage is updated to Commit', async () => {
        await expect(borda.updateStage()).to.emit(borda, 'VoteStart');
      });

      it("Doesn't allow non-trustee to vote", async () => {
        await expect(borda.commit(ethers.utils.randomBytes(32))).to.be.revertedWith(
          'Only trusted nodes can call this method',
        );
      });

      it('Allows trustees to vote', async () => {
        await borda.connect(bob).commit(ethers.utils.randomBytes(32));
      });

      it('Emits VoteCast event when commit is called', async () => {
        await expect(borda.connect(dave).commit(ethers.utils.randomBytes(32)))
          .to.emit(borda, 'VoteCast')
          .withArgs(await dave.getAddress());
      });
    });

    describe('Reveal phase', () => {
      it('Emits RevealStart when stage is updated to Reveal', async () => {
        await time.increase(3600 * 24 * 10.1);
        await borda.updateStage();
        await time.increase(3600 * 24 * 3);
        await expect(borda.updateStage()).to.emit(borda, 'RevealStart');
      });

      it('Cannot reveal without voting', async () => {
        await time.increase(3600 * 24 * 10.1);
        await borda.updateStage();
        await time.increase(3600 * 24 * 3);

        await expect(
          borda.reveal(ethers.utils.randomBytes(32), [
            await bob.getAddress(),
            await charlie.getAddress(),
          ]),
        ).to.be.revertedWith('No unrevealed commitment exists');
      });

      it('Rejects empty votes', async () => {
        const seed = ethers.utils.randomBytes(32);
        await time.increase(3600 * 24 * 10.1);
        await borda.connect(bob).commit(hash([seed, await bob.getAddress(), []]));
        await time.increase(3600 * 24 * 3);
        await expect(borda.connect(bob).reveal(seed, [])).to.be.revertedWith('Cannot vote empty');
      });

      it('Rejects invalid votes', async () => {
        const seed = ethers.utils.randomBytes(32);
        await time.increase(3600 * 24 * 10.1);
        await borda
          .connect(bob)
          .commit(hash([seed, await bob.getAddress(), [await alice.getAddress()]]));
        await time.increase(3600 * 24 * 3);
        await expect(
          borda.connect(bob).reveal(seed, [await alice.getAddress()]),
        ).to.be.revertedWith('Invalid vote, missing proposal');
      });

      it('Reject duplicate votes', async () => {
        const seed = ethers.utils.randomBytes(32);
        await borda.connect(bob).propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'), '');
        await time.increase(3600 * 24 * 10.1);
        await borda
          .connect(bob)
          .commit(
            hash([seed, await bob.getAddress(), [await bob.getAddress(), await bob.getAddress()]]),
          );
        await time.increase(3600 * 24 * 3);
        await expect(
          borda.connect(bob).reveal(seed, [await bob.getAddress(), await bob.getAddress()]),
        ).to.be.revertedWith('Invalid vote, repeated address');
      });

      it('Rejects changed votes', async () => {
        const seed = ethers.utils.randomBytes(32);
        await time.increase(3600 * 24 * 10.1);
        await borda
          .connect(bob)
          .commit(hash([seed, await bob.getAddress(), [await bob.getAddress()]]));
        await time.increase(3600 * 24 * 3);
        await expect(
          borda.connect(bob).reveal(seed, [await charlie.getAddress()]),
        ).to.be.revertedWith('Commitment mismatch');
      });

      it('Emits VoteReveal when vote is correctly revealed', async () => {
        const seed = ethers.utils.randomBytes(32);
        await borda.connect(bob).propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'), '');
        await time.increase(3600 * 24 * 10.1);
        await borda
          .connect(bob)
          .commit(hash([seed, await bob.getAddress(), [await bob.getAddress()]]));
        await time.increase(3600 * 24 * 3);
        await expect(borda.connect(bob).reveal(seed, [await bob.getAddress()]))
          .to.emit(borda, 'VoteReveal')
          .withArgs(await bob.getAddress(), [await bob.getAddress()]);
      });

      it('Allows reveals of correct votes', async () => {
        const seed = ethers.utils.randomBytes(32);
        await borda.connect(bob).propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'), '');
        await time.increase(3600 * 24 * 10.1);
        await borda
          .connect(bob)
          .commit(hash([seed, await bob.getAddress(), [await bob.getAddress()]]));
        await time.increase(3600 * 24 * 3);
        await borda.connect(bob).reveal(seed, [await bob.getAddress()]);
      });

      describe('With valid commits', async () => {
        let bobvote;
        let charlievote;
        let davevote;

        before(async () => {
          bobvote = [
            ethers.utils.randomBytes(32),
            await bob.getAddress(),
            [await bob.getAddress(), await charlie.getAddress(), await dave.getAddress()],
          ];
          charlievote = [
            ethers.utils.randomBytes(32),
            await charlie.getAddress(),
            [await charlie.getAddress()],
          ];
          davevote = [
            ethers.utils.randomBytes(32),
            await dave.getAddress(),
            [await dave.getAddress(), await bob.getAddress(), await charlie.getAddress()],
          ];
        });

        beforeEach(async () => {
          await borda.connect(dave).propose(10, 10, 10, 10, BigNumber.from('1000000000000000000'), '');
          await borda
            .connect(charlie)
            .propose(20, 20, 20, 20, BigNumber.from('1000000000000000000'), '');
          await borda.connect(bob).propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'), '');
          await time.increase(3600 * 24 * 10.1);

          await borda.connect(bob).commit(hash(bobvote));
          await borda.connect(charlie).commit(hash(charlievote));
          await borda.connect(dave).commit(hash(davevote));

          await time.increase(3600 * 24 * 3);
        });

        it('Updates state after bob reveals', async () => {
          const tx = await borda.connect(bob).reveal(bobvote[0], bobvote[2]);
          const receipt = await tx.wait();
          console.log(receipt.gasUsed);
          expect(await borda.score(await bob.getAddress())).to.equal(3);
          expect(await borda.score(await charlie.getAddress())).to.equal(2);
          expect(await borda.score(await dave.getAddress())).to.equal(1);
          expect(await borda.leader()).to.equal(await bob.getAddress());
        });

        it('Updates state after bob and charlie reveals', async () => {
          const tx1 = await borda.connect(bob).reveal(bobvote[0], bobvote[2]);
          const receipt1 = await tx1.wait();
          console.log(receipt1.gasUsed);
          // Charlie has only 1 vote, and as each vote gets n-1 points, this does nothing
          const tx2 = await borda.connect(charlie).reveal(charlievote[0], charlievote[2]);
          const receipt2 = await tx2.wait();
          console.log(receipt2.gasUsed);
          expect(await borda.score(await bob.getAddress())).to.equal(3);
          expect(await borda.score(await charlie.getAddress())).to.equal(3);
          expect(await borda.score(await dave.getAddress())).to.equal(1);
          expect(await borda.leader()).to.equal(await bob.getAddress());
        });

        it('Updates state after everyone reveals', async () => {
          await borda.connect(bob).reveal(bobvote[0], bobvote[2]);
          await borda.connect(charlie).reveal(charlievote[0], charlievote[2]);
          const tx = await borda.connect(dave).reveal(davevote[0], davevote[2]);
          const receipt = await tx.wait();
          console.log(receipt.gasUsed);
          expect(await borda.score(await bob.getAddress())).to.equal(5);
          expect(await borda.score(await charlie.getAddress())).to.equal(4);
          expect(await borda.score(await dave.getAddress())).to.equal(4);
          expect(await borda.leader()).to.equal(await bob.getAddress());
        });

        it('Computing defaults if no one reveals', async () => {
          await time.increase(3600 * 24 * 1);
          await borda.updateStage();
          await borda.compute();
          expect(await borda.winner()).to.equal('0x0000000000000000000000000000000000000000');
        });

        it('Charlie reveal should not override the default vote', async () => {
          await borda.connect(charlie).reveal(charlievote[0], charlievote[2]);
          await time.increase(3600 * 24 * 1);
          await borda.updateStage();
          await borda.compute();
          expect(await borda.winner()).to.equal('0x0000000000000000000000000000000000000000');
        });

        describe('Compute Phase', async () => {
          beforeEach(async () => {
            await borda.connect(bob).reveal(bobvote[0], bobvote[2]);
            // await borda.reveal(charlievote[0], charlievote[2], { from: charlie });
            await borda.connect(dave).reveal(davevote[0], davevote[2]);
          });
          it('Emits VoteResult', async () => {
            await time.increase(3600 * 24 * 1);
            await borda.updateStage();
            await expect(borda.compute())
              .to.emit(borda, 'VoteResult')
              .withArgs(await bob.getAddress());
          });

          it('Picks a winner', async () => {
            await time.increase(3600 * 24 * 1);
            await borda.updateStage();
            await borda.compute();
            expect(await borda.winner()).to.equal(await bob.getAddress());
          });

          it('Successfully records the vote of the trustees', async () => {
            // bob and dave do reveal
            expect(await trustedNodes.votingRecord(await bob.getAddress())).to.equal(
              BigNumber.from(1),
            );
            expect(await trustedNodes.votingRecord(await dave.getAddress())).to.equal(
              BigNumber.from(1),
            );

            // charlie didn't reveal
            expect(await trustedNodes.votingRecord(await charlie.getAddress())).to.equal(
              BigNumber.from(0),
            );
          });

          describe('reward withdrawal', async () => {
            it('doesnt let you withdraw for votes from this year', async () => {
              await expect(
                trustedNodes.connect(dave).redeemVoteRewards(),
              ).to.be.revertedWith('No vested rewards to redeem');
            });
            it('pays out trustee in simple case', async () => {
              const trustees = await trustedNodes.connect(alice).numTrustees();
              // should be 26 * numTrustees - 2 reveals = 76
              expect(await trustedNodes.connect(alice).unallocatedRewardsCount()).to.equal(76);
              let daveCurrentVotes = await trustedNodes.connect(dave)
                .votingRecord(await dave.getAddress());
              expect(daveCurrentVotes).to.equal(1);
              // rewards for the current year and the next year
              await faucet.mintx(
                trustedNodes.address,
                BigNumber.from((2 * trustees * 26 * votingReward).toString()),
              );
              await time.increase(3600 * 24 * 14 * 26);

              expect(await trustedNodes.connect(dave).annualUpdate())
                .to.emit(trustedNodes, 'VotingRewardRedemption')
                .withArgs(
                  await trustedNodes.connect(alice).hoard(),
                  BigNumber.from((76 * votingReward).toString()),
                );

              daveCurrentVotes = await trustedNodes.connect(dave)
                .votingRecord(await dave.getAddress());
              const daveLastYearVotes = await trustedNodes.connect(dave)
                .lastYearVotingRecord(await dave.getAddress());
              expect(daveCurrentVotes).to.equal(0);
              expect(daveLastYearVotes).to.equal(1);

              // no redemption right now, one gen must pass
              await trustedNodes.connect(dave).redeemVoteRewards();
              expect(await ecox.balanceOf(await dave.getAddress())).to.equal(0);

              await time.increase(3600 * 24 * 14);
              await (timedPolicies.connect(alice).incrementGeneration());
              const tx = await trustedNodes.connect(dave).redeemVoteRewards();
              const receipt = await tx.wait();
              console.log(`redeem 1 reward: ${receipt.gasUsed}`);

              expect(await ecox.balanceOf(await dave.getAddress())).to.equal(votingReward);

              expect(await trustedNodes.lastYearVotingRecord(await dave.getAddress()))
                .to.equal(BigNumber.from(0));
            });

            it('pays out trustee appropriately in complex case', async () => {
              const trustees = await trustedNodes.connect(alice).numTrustees();
              let daveCurrentVotes = await trustedNodes.connect(dave)
                .votingRecord(await dave.getAddress());
              expect(daveCurrentVotes).to.equal(1);
              // rewards for the current year and the next year

              // dave reveals once in year 1
              await faucet.mintx(
                trustedNodes.address,
                BigNumber.from((2 * trustees * 26 * votingReward).toString()),
              );
              await time.increase(3600 * 24 * 14 * 26);
              const tx = await trustedNodes.connect(dave).annualUpdate();
              const receipt = await tx.wait();
              console.log(`annualUpdate: ${receipt.gasUsed}`);

              // YEAR 2
              daveCurrentVotes = await trustedNodes.connect(dave)
                .votingRecord(await dave.getAddress());
              const daveLastYearVotes = await trustedNodes.connect(dave)
                .lastYearVotingRecord(await dave.getAddress());
              expect(daveCurrentVotes).to.equal(0);
              expect(daveLastYearVotes).to.equal(1);

              // currencyGovernance cycle in gen 1 of year - dave reveals
              let originalBorda2 = await deploy('CurrencyGovernance', policy.address);
              let bordaCloner2 = await deploy('Cloner', originalBorda2.address);
              borda = await ethers.getContractAt('CurrencyGovernance', await bordaCloner2.clone());
              await policy.testDirectSet('CurrencyGovernance', borda.address);

              await borda.connect(dave)
                .propose(10, 10, 10, 10, BigNumber.from('1000000000000000000'));
              await time.increase(3600 * 24 * 10.1);

              const davevote2 = [
                ethers.utils.randomBytes(32),
                await dave.getAddress(),
                [await dave.getAddress()],
              ];
              await borda.connect(dave).commit(hash(davevote2));
              await time.increase(3600 * 24 * 3);

              await borda.connect(dave).reveal(davevote2[0], davevote2[2]);
              expect(await trustedNodes.connect(dave)
                .votingRecord(await dave.getAddress())).to.equal(1);
              await time.increase(3600 * 24 * 1);

              await (timedPolicies.connect(alice).incrementGeneration());

              // currencyGovernance cycle in gen 2 of year 2, nothing happens
              originalBorda2 = await deploy('CurrencyGovernance', policy.address);
              bordaCloner2 = await deploy('Cloner', originalBorda2.address);
              borda = await ethers.getContractAt('CurrencyGovernance', await bordaCloner2.clone());
              await policy.testDirectSet('CurrencyGovernance', borda.address);

              await time.increase(3600 * 24 * 14.1);
              await (timedPolicies.connect(alice).incrementGeneration());

              // currencyGovernance cycle in gen 3 of year 2 - dave reveals again
              originalBorda2 = await deploy('CurrencyGovernance', policy.address);
              bordaCloner2 = await deploy('Cloner', originalBorda2.address);
              borda = await ethers.getContractAt('CurrencyGovernance', await bordaCloner2.clone());
              await policy.testDirectSet('CurrencyGovernance', borda.address);

              await borda.connect(dave)
                .propose(10, 10, 10, 10, BigNumber.from('1000000000000000000'));
              await time.increase(3600 * 24 * 10.1);

              await borda.connect(dave).commit(hash(davevote2));
              await time.increase(3600 * 24 * 3);

              await borda.connect(dave).reveal(davevote2[0], davevote2[2]);
              expect(await trustedNodes.connect(dave).votingRecord(await dave.getAddress()))
                .to.equal(2);
              await time.increase(3600 * 24 * 1);

              await (timedPolicies.connect(alice).incrementGeneration());

              await time.increase(3600 * 24 * 14 * 23);

              await faucet.mintx(
                trustedNodes.address,
                BigNumber.from((trustees * 26 * votingReward).toString()),
              );
              await trustedNodes.connect(dave).annualUpdate();

              expect(await trustedNodes.connect(dave).votingRecord(await dave.getAddress()))
                .to.equal(0);
              expect(await trustedNodes.connect(dave).lastYearVotingRecord(await dave.getAddress()))
                .to.equal(2);
              expect(await trustedNodes.connect(dave).fullyVestedRewards(await dave.getAddress()))
                .to.equal(1);

              // YEAR 3

              // after 0 generations in year 3 --> expect to redeem 1 reward: the fully vested one
              expect(await trustedNodes.connect(dave).fullyVestedRewards(await dave.getAddress()))
                .to.equal(1);
              await expect(trustedNodes.connect(dave).redeemVoteRewards())
                .to.emit(trustedNodes, 'VotingRewardRedemption')
                .withArgs(await dave.getAddress(), votingReward);
              expect(await trustedNodes.connect(dave).fullyVestedRewards(await dave.getAddress()))
                .to.equal(0);

              await time.increase(3600 * 24 * 14);
              await (timedPolicies.connect(alice).incrementGeneration());

              // after 1 generation in year 3 --> expect to redeem 1: corresponding to year 2 gen 1

              expect(await trustedNodes.connect(dave)
                .lastYearVotingRecord(await dave.getAddress())).to.equal(2);
              await expect(trustedNodes.connect(dave).redeemVoteRewards())
                .to.emit(trustedNodes, 'VotingRewardRedemption')
                .withArgs(await dave.getAddress(), votingReward);
              expect(await trustedNodes.connect(dave)
                .lastYearVotingRecord(await dave.getAddress())).to.equal(1);

              await time.increase(3600 * 24 * 14);
              await (timedPolicies.connect(alice).incrementGeneration());

              // after 2 generations in year 3 --> expect to redeem 1: corresponding to year 2 gen 3

              expect(await trustedNodes.connect(dave)
                .lastYearVotingRecord(await dave.getAddress())).to.equal(1);
              await expect(trustedNodes.connect(dave).redeemVoteRewards())
                .to.emit(trustedNodes, 'VotingRewardRedemption')
                .withArgs(await dave.getAddress(), votingReward);
              expect(await trustedNodes.connect(dave)
                .lastYearVotingRecord(await dave.getAddress())).to.equal(0);

              // const tx2 = await trustedNodes.connect(dave).redeemVoteRewards();
              // const receipt2 = await tx2.wait();
              // console.log("three withdraws: " + receipt2.gasUsed);
              // expect(await ecox.balanceOf(await dave.getAddress())).to.equal(votingReward *);
            });
          });
        });
      });
    });
  });

  context('many trustees', () => {
    beforeEach(async () => {
      const trustednodes = [
        await bob.getAddress(),
        await charlie.getAddress(),
        await dave.getAddress(),
        ...additionalTrustees.map(async (t) => t.getAddress()),
      ];

      ({
        policy, trustedNodes, faucet, ecox, timedPolicies,
      } = await ecoFixture(trustednodes));

      const originalBorda = await deploy('CurrencyGovernance', policy.address);
      const bordaCloner = await deploy('Cloner', originalBorda.address);
      borda = await ethers.getContractAt('CurrencyGovernance', await bordaCloner.clone());
      // console.log(borda.address);
      await policy.testDirectSet('CurrencyGovernance', borda.address);
    });

    describe('reveal stresstesting', () => {
      /* eslint-disable no-loop-func, no-await-in-loop */
      for (let i = 0; i < additionalTrustees.length; i++) {
        it(`testing revealing with ${i + 4} proposals`, async () => {
          await borda.connect(dave).propose(10, 10, 10, 10, BigNumber.from('1000000000000000000'), '');
          await borda
            .connect(charlie)
            .propose(20, 20, 20, 20, BigNumber.from('1000000000000000000', ''));
          await borda.connect(bob).propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'), '');
          for (let j = 0; j < additionalTrustees.length; j++) {
            await borda
              .connect(additionalTrustees[j])
              .propose(40, 40, 40, 40, BigNumber.from('1000000000000000000'), '');
          }
          await time.increase(3600 * 24 * 10.1);

          const bobvote = [
            ethers.utils.randomBytes(32),
            bob,
            [
              await bob.getAddress(),
              await charlie.getAddress(),
              await dave.getAddress(),
              ...additionalTrustees.slice(0, i + 1),
            ],
          ];
          const bobreveal = [bobvote[0], bobvote[2]];
          await borda.connect(bob).commit(hash(bobvote));

          await time.increase(3600 * 24 * 3);

          const tx = await borda.connect(bob).reveal(...bobreveal);
          const receipt = await tx.wait();
          console.log(receipt.gasUsed);
        });
      }
    });
  });
});
