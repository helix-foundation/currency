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

  const veryHighTrusteeVotingReward = '57896044618658097711785492504343953926634992332820282019728792003956564819968';

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
      } = await ecoFixture(trustednodes, veryHighTrusteeVotingReward));

      const originalBorda = await deploy('CurrencyGovernance', policy.address);
      const bordaCloner = await deploy('Cloner', originalBorda.address);
      borda = await ethers.getContractAt('CurrencyGovernance', await bordaCloner.clone());
      // console.log(borda.address);
      await policy.testDirectSet('CurrencyGovernance', borda.address);
    });

    describe('Propose phase', () => {
      it("Doesn't allow non-trustee to propose", async () => {
        await expect(
          borda.propose(33, 34, 35, 36, BigNumber.from('1000000000000000000')),
        ).to.be.revertedWith('Only trusted nodes can call this method');
      });

      it('Allows trustees to propose', async () => {
        await borda.connect(bob).propose(33, 34, 35, 36, BigNumber.from('1000000000000000000'));

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
        await borda.connect(bob).propose(33, 34, 35, 36, BigNumber.from('1000000000000000000'));
        await borda.connect(bob).unpropose();

        const p = await borda.proposals(await bob.getAddress());
        expect(p.inflationMultiplier).to.equal(0);
      });

      it('Emits ProposalCreation event when proposal is created', async () => {
        await borda.connect(bob).propose(33, 34, 35, 36, BigNumber.from('1000000000000000000'));
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
        await borda.connect(dave).propose(10, 10, 10, 10, BigNumber.from('1000000000000000000'));
        await borda.connect(charlie).propose(20, 20, 20, 20, BigNumber.from('1000000000000000000'));
        await borda.connect(bob).propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'));
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
        await borda.connect(bob).propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'));
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
        await borda.connect(bob).propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'));
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
        await borda.connect(bob).propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'));
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
          await borda.connect(dave).propose(10, 10, 10, 10, BigNumber.from('1000000000000000000'));
          await borda
            .connect(charlie)
            .propose(20, 20, 20, 20, BigNumber.from('1000000000000000000'));
          await borda.connect(bob).propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'));
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
            it("doesnt let you withdraw if not enough time (<26 weeks) has passed", async () => {
              await time.increase(3600 * 24 * 14 * 25.9);
              await faucet.mintx(trustedNodes.address, BigNumber.from(veryHighTrusteeVotingReward));
              await expect(
                trustedNodes.connect(dave).redeemVoteRewards(),
                ).to.be.revertedWith("No vested rewards to redeem");
            })
            it('Can pay out trustee vote rewards if enough time has passed', async () => {

              await faucet.mintx(trustedNodes.address, BigNumber.from(veryHighTrusteeVotingReward));
              await time.increase(3600 * 24 * 14 * 27.1);
              await trustedNodes.connect(dave).redeemVoteRewards();
              expect(await ecox.balanceOf(await dave.getAddress()))
                .to.equal(BigNumber.from(veryHighTrusteeVotingReward));
              expect(await trustedNodes.votingRecord(await dave.getAddress()))
                .to.equal(BigNumber.from(0));
              expect(await trustedNodes.votingRecord(await bob.getAddress()))
                .to.equal(BigNumber.from(1));
            });

            it('handles potential overflow of trustee rewards with grace', async () => {
              await time.increase(3600 * 24 * 1.1);
              await timedPolicies.incrementGeneration();

              const originalBorda2 = await deploy('CurrencyGovernance', policy.address);
              const bordaCloner2 = await deploy('Cloner', originalBorda2.address);
              borda = await ethers.getContractAt('CurrencyGovernance', await bordaCloner2.clone());
              await policy.testDirectSet('CurrencyGovernance', borda.address);

              await borda.connect(dave).propose(10, 10, 10, 10, BigNumber.from('1000000000000000000'));
              await borda.connect(charlie).propose(20, 20, 20, 20, BigNumber.from('1000000000000000000'));
              await borda.connect(bob).propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'));
              await time.increase(3600 * 24 * 10.1);

              await borda.connect(bob).commit(hash(bobvote));
              await time.increase(3600 * 24 * 3.1);

              await borda.connect(bob).reveal(bobvote[0], bobvote[2]);
              const oldBobBalance = await ecox.balanceOf(bob.getAddress());

              await faucet.mintx(trustedNodes.address, BigNumber.from(veryHighTrusteeVotingReward));
              expect(await trustedNodes.votingRecord(await bob.getAddress()))
                .to.equal(BigNumber.from(BigNumber.from(2)));
              await trustedNodes.connect(bob).redeemVoteRewards();
              expect(await ecox.balanceOf(await bob.getAddress()))
                .to.equal(BigNumber.from(veryHighTrusteeVotingReward).add(oldBobBalance));
              expect(await trustedNodes.votingRecord(await bob.getAddress()))
                .to.equal(BigNumber.from(1));
            });
          })
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
          await borda.connect(dave).propose(10, 10, 10, 10, BigNumber.from('1000000000000000000'));
          await borda
            .connect(charlie)
            .propose(20, 20, 20, 20, BigNumber.from('1000000000000000000'));
          await borda.connect(bob).propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'));
          for (let j = 0; j < additionalTrustees.length; j++) {
            await borda
              .connect(additionalTrustees[j])
              .propose(40, 40, 40, 40, BigNumber.from('1000000000000000000'));
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
