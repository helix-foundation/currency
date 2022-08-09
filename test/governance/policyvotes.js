const { expect } = require('chai')

const { ethers } = require('hardhat')
const time = require('../utils/time.ts')
const { ecoFixture } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')
const util = require('../../tools/test/util')

describe('PolicyVotes [@group=8]', () => {
  let policy
  let eco
  let ecox
  let initInflation
  let policyVotes
  let proposal
  let proxiedPolicyVotes
  let timedPolicies
  const one = ethers.utils.parseEther('1')

  let alice
  let bob
  let charlie
  let dave
  let frank

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie, dave, frank] = accounts
    ;({
      policy,
      eco,
      faucet: initInflation,
      timedPolicies,
      ecox,
    } = await ecoFixture([]))

    await initInflation.mint(await alice.getAddress(), one.mul(5000))
    await initInflation.mint(await bob.getAddress(), one.mul(8000))
    await initInflation.mint(await charlie.getAddress(), one.mul(5200))
    await initInflation.mint(await dave.getAddress(), one.mul(4800))
    await time.increase(3600 * 24 * 40)
    await timedPolicies.incrementGeneration()

    policyVotes = await deploy(
      'PolicyVotes',
      policy.address,
      eco.address,
      ecox.address
    )
    proposal = (await deploy('SampleProposal', 0)).address
    const proxy = await deploy('ForwardProxy', policyVotes.address)
    proxiedPolicyVotes = await ethers.getContractAt(
      'PolicyVotes',
      proxy.address
    )
    await policy.testDirectSet('PolicyVotes', proxiedPolicyVotes.address)
  })

  // describe('initialize', () => {
  //   it('can be proxied', async () => {
  //     await ForwardProxy.new(policyVotes.address);
  //   });
  // });

  describe('configure', () => {
    describe('when called on a proxied instance', () => {
      context('that has not been configured', () => {
        it('succeeds', async () => {
          await proxiedPolicyVotes.configure(
            proposal,
            await alice.getAddress(),
            await time.latestBlock()
          )
        })

        it('sets the veto end time', async () => {
          await proxiedPolicyVotes.configure(
            proposal,
            await alice.getAddress(),
            await time.latestBlock()
          )

          assert.notEqual((await proxiedPolicyVotes.voteEnds()).toString(), 0)
        })
      })

      context('that has already been configured', () => {
        beforeEach(async () => {
          await proxiedPolicyVotes.configure(
            proposal,
            await alice.getAddress(),
            await time.latestBlock()
          )
        })

        it('reverts', async () => {
          await expect(
            proxiedPolicyVotes.configure(
              proposal,
              await alice.getAddress(),
              await time.latestBlock()
            )
          ).to.be.revertedWith('has already been configured')
        })
      })
    })
  })

  describe('vote', () => {
    context('before the contract is configured', () => {
      it('reverts', async () => {
        await expect(proxiedPolicyVotes.vote(true)).to.be.revertedWith(
          'Votes can only be recorded during the voting period'
        )
      })
    })

    context('when the contract is configured', () => {
      beforeEach(async () => {
        await proxiedPolicyVotes.configure(
          proposal,
          await alice.getAddress(),
          await time.latestBlock()
        )
      })

      context('after the commitment period', () => {
        beforeEach(async () => {
          await time.increase(3600 * 24 * 22)
        })

        it('reverts', async () => {
          await expect(proxiedPolicyVotes.vote(true)).to.be.revertedWith(
            'Votes can only be recorded during the voting period'
          )
        })
      })

      context('during the commitment period', () => {
        context('with no tokens', () => {
          it('reverts', async () => {
            await expect(
              proxiedPolicyVotes.connect(frank).vote(true)
            ).to.be.revertedWith('must have held tokens')
          })
        })

        context('with tokens', () => {
          it('can vote', async () => {
            await expect(proxiedPolicyVotes.connect(alice).vote(true))
              .to.emit(proxiedPolicyVotes, 'PolicyVote')
              .withArgs(await alice.getAddress(), true, one.mul(5000))
          })

          it('increases the total stake', async () => {
            const startStake = await proxiedPolicyVotes.totalStake()

            await proxiedPolicyVotes.vote(true)

            assert(
              startStake
                .add(await eco.balanceOf(await alice.getAddress()))
                .eq(await proxiedPolicyVotes.totalStake())
            )
          })

          it('increases the yes stake on yes', async () => {
            const startStake = await proxiedPolicyVotes.yesStake()

            await proxiedPolicyVotes.vote(true)

            expect(await proxiedPolicyVotes.yesStake()).to.equal(
              startStake.add(await eco.balanceOf(await alice.getAddress()))
            )
          })

          it('does not increas the yes stake on no', async () => {
            const startStake = await proxiedPolicyVotes.yesStake()

            await proxiedPolicyVotes.vote(false)

            expect(await proxiedPolicyVotes.yesStake()).to.equal(startStake)
          })

          context('with an existing yes vote', () => {
            beforeEach(async () => {
              await proxiedPolicyVotes.vote(true)
            })

            it('does not increase total stake', async () => {
              const startStake = await proxiedPolicyVotes.totalStake()

              await proxiedPolicyVotes.vote(false)

              expect(await proxiedPolicyVotes.totalStake()).to.equal(startStake)
            })

            it('decreases yes stake', async () => {
              const startStake = await proxiedPolicyVotes.yesStake()

              await proxiedPolicyVotes.vote(false)

              expect(await proxiedPolicyVotes.yesStake()).to.equal(
                startStake.sub(await eco.balanceOf(await alice.getAddress()))
              )
            })
          })

          context('with an existing no vote', () => {
            beforeEach(async () => {
              await proxiedPolicyVotes.vote(false)
            })

            it('does not increase total stake', async () => {
              const startStake = await proxiedPolicyVotes.totalStake()

              await proxiedPolicyVotes.vote(true)

              expect(await proxiedPolicyVotes.totalStake()).to.equal(startStake)
            })

            it('increases yes stake', async () => {
              const startStake = await proxiedPolicyVotes.yesStake()

              await proxiedPolicyVotes.vote(true)

              expect(await proxiedPolicyVotes.yesStake()).to.equal(
                startStake.add(await eco.balanceOf(await alice.getAddress()))
              )
            })
          })
        })
      })
    })
  })

  describe('voteSplit', () => {
    context('before the contract is configured', () => {
      it('reverts', async () => {
        await expect(proxiedPolicyVotes.voteSplit(1, 1)).to.be.revertedWith(
          'Votes can only be recorded during the voting period'
        )
      })
    })

    context('when the contract is configured', () => {
      beforeEach(async () => {
        await proxiedPolicyVotes.configure(
          proposal,
          await alice.getAddress(),
          await time.latestBlock()
        )
      })

      context('after the commitment period', () => {
        beforeEach(async () => {
          await time.increase(3600 * 24 * 22)
        })

        it('reverts', async () => {
          await expect(proxiedPolicyVotes.voteSplit(1, 1)).to.be.revertedWith(
            'Votes can only be recorded during the voting period'
          )
        })
      })

      context('during the commitment period', () => {
        context('with no tokens', () => {
          it('reverts', async () => {
            await expect(
              proxiedPolicyVotes.connect(frank).voteSplit(0, 0)
            ).to.be.revertedWith('must have held tokens')
          })
        })

        context('with tokens', () => {
          it('can vote', async () => {
            await expect(proxiedPolicyVotes.voteSplit(42, 1101))
              .to.emit(proxiedPolicyVotes, 'PolicySplitVoteCast')
              .withArgs(await alice.getAddress(), '42', '1101')
          })

          it('cannot vote more than owned', async () => {
            await expect(
              proxiedPolicyVotes.voteSplit(one.mul(5000), one.mul(3000))
            ).to.be.revertedWith(
              'Your voting power is less than submitted yes + no votes'
            )
          })

          describe('increases the total stake', () => {
            it('when the whole balance is voted', async () => {
              const startStake = await proxiedPolicyVotes.totalStake()

              await proxiedPolicyVotes.voteSplit(one.mul(2000), one.mul(3000))

              assert(
                startStake
                  .add(await eco.balanceOf(await alice.getAddress()))
                  .eq(await proxiedPolicyVotes.totalStake())
              )
            })

            it('when some of the balance is voted', async () => {
              const startStake = await proxiedPolicyVotes.totalStake()

              await proxiedPolicyVotes.voteSplit(one.mul(1500), one.mul(200))

              assert(
                startStake
                  .add(one.mul(1700))
                  .eq(await proxiedPolicyVotes.totalStake())
              )
            })
          })

          it('increases the yes stake on yes', async () => {
            const startStake = await proxiedPolicyVotes.yesStake()

            await proxiedPolicyVotes.voteSplit(one.mul(1500), one.mul(200))

            expect(await proxiedPolicyVotes.yesStake()).to.equal(
              startStake.add(one.mul(1500))
            )
          })

          context('with an existing vote and the same total', () => {
            beforeEach(async () => {
              await proxiedPolicyVotes.voteSplit(one.mul(1500), one.mul(200))
            })

            it('does not increase total stake', async () => {
              const startStake = await proxiedPolicyVotes.totalStake()

              await proxiedPolicyVotes.voteSplit(one.mul(1000), one.mul(700))

              expect(await proxiedPolicyVotes.totalStake()).to.equal(startStake)
            })

            it('decreases yes stake', async () => {
              const startStake = await proxiedPolicyVotes.yesStake()

              await proxiedPolicyVotes.voteSplit(one.mul(1000), one.mul(700))

              expect(await proxiedPolicyVotes.yesStake()).to.equal(
                startStake.sub(one.mul(500))
              )
            })
          })

          context('with an existing vote and different total', () => {
            beforeEach(async () => {
              await proxiedPolicyVotes.voteSplit(one.mul(1500), one.mul(200))
            })

            it('correctly increases total stake', async () => {
              const startStake = await proxiedPolicyVotes.totalStake()

              await proxiedPolicyVotes.voteSplit(one.mul(2500), one.mul(1200))

              expect(await proxiedPolicyVotes.totalStake()).to.equal(
                startStake.add(one.mul(2000))
              )
            })

            it('correctly increases yes stake', async () => {
              const startStake = await proxiedPolicyVotes.yesStake()

              await proxiedPolicyVotes.voteSplit(one.mul(2500), one.mul(1200))

              expect(await proxiedPolicyVotes.yesStake()).to.equal(
                startStake.add(one.mul(1000))
              )
            })
          })

          context('vote -> voteSplit', () => {
            beforeEach(async () => {
              await proxiedPolicyVotes.vote(true)
            })

            it('correctly decreases total stake', async () => {
              const startStake = await proxiedPolicyVotes.totalStake()

              await proxiedPolicyVotes.voteSplit(one.mul(2500), one.mul(1200))

              expect(await proxiedPolicyVotes.totalStake()).to.equal(
                startStake.sub(one.mul(1300))
              )
            })

            it('correctly decreases yes stake', async () => {
              const startStake = await proxiedPolicyVotes.yesStake()

              await proxiedPolicyVotes.voteSplit(one.mul(2500), one.mul(1200))

              expect(await proxiedPolicyVotes.yesStake()).to.equal(
                startStake.sub(one.mul(2500))
              )
            })
          })

          context('voteSplit -> vote', () => {
            beforeEach(async () => {
              await proxiedPolicyVotes.voteSplit(one.mul(1500), one.mul(200))
            })

            it('correctly increases total stake', async () => {
              const startStake = await proxiedPolicyVotes.totalStake()

              await proxiedPolicyVotes.vote(true)

              expect(await proxiedPolicyVotes.totalStake()).to.equal(
                startStake.add(one.mul(3300))
              )
            })

            it('correctly increases yes stake on yes', async () => {
              const startStake = await proxiedPolicyVotes.yesStake()

              await proxiedPolicyVotes.vote(true)

              expect(await proxiedPolicyVotes.yesStake()).to.equal(
                startStake.add(one.mul(3500))
              )
            })

            it('correctly decreases yes stake on no', async () => {
              const startStake = await proxiedPolicyVotes.yesStake()

              await proxiedPolicyVotes.vote(false)

              expect(await proxiedPolicyVotes.yesStake()).to.equal(
                startStake.sub(one.mul(1500))
              )
            })
          })
        })
      })
    })
  })

  describe('execute', () => {
    const adoptedPolicyIdHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['TestSample']
    )
    const votesPolicyIdHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['PolicyVotes']
    )

    beforeEach(async () => {
      await proxiedPolicyVotes.configure(
        proposal,
        await alice.getAddress(),
        await time.latestBlock()
      )
    })

    context('when no one votes', () => {
      it('fails', async () => {
        await time.increase(3600 * 24 * 4.1)
        await expect(proxiedPolicyVotes.execute())
          .to.emit(proxiedPolicyVotes, 'VoteCompletion')
          .withArgs(2)
      })
    })

    context('with votes', () => {
      beforeEach(async () => {
        await proxiedPolicyVotes.connect(charlie).vote(true)

        await proxiedPolicyVotes.connect(dave).vote(false)
      })

      context('called on a non-proxied instance', () => {
        it('reverts', async () => {
          await expect(policyVotes.execute()).to.be.revertedWith('revert')
        })
      })

      context('when called early, without majority support', () => {
        it('reverts', async () => {
          await expect(proxiedPolicyVotes.execute()).to.be.revertedWith(
            'Majority support required for early enaction'
          )
        })
      })

      context('when called after the delay, with plurality support', () => {
        it('succeeds', async () => {
          await time.increase(3600 * 24 * 4.1)

          await expect(proxiedPolicyVotes.execute())
            .to.emit(proxiedPolicyVotes, 'VoteCompletion')
            .withArgs(0)
        })
      })

      context('when called early with majority of total stake', () => {
        it('succeeds', async () => {
          await proxiedPolicyVotes.connect(bob).vote(true)

          await expect(proxiedPolicyVotes.execute())
            .to.emit(proxiedPolicyVotes, 'VoteCompletion')
            .withArgs(0)
        })
      })

      context('is not PolicyVotes', () => {
        it('reverts', async () => {
          await policy.testDirectSet('PolicyVotes', policy.address)
          await time.increase(3600 * 24 * 4.1)
          await expect(proxiedPolicyVotes.execute()).to.be.revertedWith(
            'This contract no longer has authorization to enact the vote'
          )
        })
      })

      context('when no policy wins', () => {
        beforeEach(async () => {
          await proxiedPolicyVotes.connect(alice).vote(false)
          await time.increase(3600 * 24 * 4.1)

          await expect(proxiedPolicyVotes.execute())
            .to.emit(proxiedPolicyVotes, 'VoteCompletion')
            .withArgs(1)
        })

        it('does not enact the policies', async () => {
          assert.equal(await util.policyFor(policy, adoptedPolicyIdHash), 0)
        })

        it('removes itself from the PolicyVotes role', async () => {
          assert.equal(await util.policyFor(policy, votesPolicyIdHash), 0)
        })
      })

      context('when proposal wins', () => {
        beforeEach(async () => {
          await proxiedPolicyVotes.connect(bob).vote(true)

          await expect(proxiedPolicyVotes.execute())
            .to.emit(proxiedPolicyVotes, 'VoteCompletion')
            .withArgs(0)
        })

        it('adopts policy 0', async () => {
          const newPolicy = await ethers.getContractAt(
            'SampleHandler',
            await util.policyFor(policy, adoptedPolicyIdHash)
          )
          assert.equal((await newPolicy.id()).toString(), 0)
        })

        it('removes itself from the PolicyVotes role', async () => {
          assert.equal(await util.policyFor(policy, votesPolicyIdHash), 0)
        })
      })
    })
  })
})
