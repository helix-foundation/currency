/* eslint-disable no-underscore-dangle, no-await-in-loop, no-console */

const bigintCryptoUtils = require('bigint-crypto-utils')

const { expect } = require('chai')
const time = require('../utils/time.ts')
const { prove, bnHex } = require('../../tools/vdf')
const { getTree, answer } = require('../../tools/randomInflationUtils')
const {
  getCommit,
  getFormattedBallot,
} = require('../../tools/test/currencyGovernanceVote')
const { BigNumber } = ethers
const { ecoFixture, policyFor } = require('../utils/fixtures')

describe('RandomInflation [@group=5]', () => {
  let policy
  let eco
  let ecox
  let governance
  let initInflation
  let addressRootHashProposal
  let tree
  let proposedRootHash
  let rootHashProposal
  let inflation
  let currencyTimer
  let vdf
  let accounts

  let policyProposals
  let preInflationEcoSupply

  //    const inflationVote = 800000;
  //    const rewardVote = 20000;
  const inflationVote = 10
  const rewardVote = 20000

  const accountsBalances = [
    BigNumber.from('10000000000000000000000000'),
    BigNumber.from('50000000000000000000000000'),
    BigNumber.from('50000000000000000000000000'),
  ]
  const accountsSums = [
    BigNumber.from('0'),
    BigNumber.from('10000000000000000000000000'),
    BigNumber.from('60000000000000000000000000'),
  ]

  const totalSum = BigNumber.from('110000000000000000000000000')
  const amountOfAccounts = 3
  let map
  let timedPolicies

  async function configureInflationRootHash() {
    addressRootHashProposal = await inflation.inflationRootHashProposal()
    tree = getTree(map)
    proposedRootHash = tree.hash

    for (let i = 0; i < 3; i += 1) {
      eco
        .connect(accounts[i])
        .approve(
          addressRootHashProposal,
          await eco.balanceOf(await accounts[i].getAddress())
        )
    }

    rootHashProposal = await ethers.getContractAt(
      'InflationRootHashProposal',
      addressRootHashProposal
    )
    await rootHashProposal
      .connect(accounts[0])
      .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts)
    await time.increase(3600 * 25)
    await expect(
      rootHashProposal.checkRootHashStatus(await accounts[0].getAddress())
    ).to.emit(rootHashProposal, 'RootHashAcceptance')
  }

  function getRecipient(claimNumber) {
    if (BigNumber.from(claimNumber) === 0) {
      return [0, accounts[0]]
    }
    let index = accountsSums.findIndex((element) =>
      element.gt(BigNumber.from(claimNumber))
    )
    index = index === -1 ? 2 : index - 1
    return [index, accounts[index]]
  }

  async function getClaimParameters(inf, sequence) {
    const chosenClaimNumberHash = ethers.utils.solidityKeccak256(
      ['bytes32', 'uint256'],
      [await inf.seed(), sequence]
    )
    const [index, recipient] = getRecipient(
      BigNumber.from(chosenClaimNumberHash).mod(BigNumber.from(totalSum))
    )
    return [answer(tree, index), index, recipient]
  }

  /**
   * Recursively attempts to find a prime number that is within a distance to the latest blockhash
   * @returns The prime from the current blockhash that a probable prime is
   */
  async function getPrimal(attempts = 0) {
    const baseNum = BigNumber.from(await time.latestBlockHash())
    for (let i = 1; i < 1000; i++) {
      if (
        await bigintCryptoUtils.isProbablyPrime(
          BigInt(baseNum.add(i).toString()),
          30
        )
      ) {
        console.log(`primal i was ${i}, bhash was ${baseNum.toString()}`)
        return baseNum.add(i).toString()
      }
    }
    if (attempts > 2) {
      expect.fail('Could not find a primal within bounds after 3 attempts')
    }
    return getPrimal(++attempts)
  }

  before(async () => {
    let comparableAccounts = await Promise.all(
      (await ethers.getSigners()).map(async (s) => [await s.getAddress(), s])
    )
    comparableAccounts = comparableAccounts.sort((a, b) =>
      a[0].localeCompare(b[0])
    )
    accounts = comparableAccounts.map((a) => a[1])
    map = new Map([
      [await accounts[0].getAddress(), accountsBalances[0]],
      [await accounts[1].getAddress(), accountsBalances[1]],
      [await accounts[2].getAddress(), accountsBalances[2]],
    ])
  })

  beforeEach(async () => {
    ;({
      policy,
      eco,
      ecox,
      faucet: initInflation,
      timedPolicies,
      currencyTimer,
      inflation,
    } = await ecoFixture(
      await Promise.all(accounts.slice(1, 5).map(async (a) => a.getAddress()))
    ))

    await initInflation.mint(
      await accounts[0].getAddress(),
      accountsBalances[0]
    )
    await initInflation.mint(
      await accounts[1].getAddress(),
      accountsBalances[1]
    )
    await initInflation.mint(
      await accounts[2].getAddress(),
      accountsBalances[2]
    )

    preInflationEcoSupply = await eco.totalSupply()

    governance = await ethers.getContractAt(
      'CurrencyGovernance',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
      )
    )

    const bob = accounts[1]
    const charlie = accounts[2]
    const dave = accounts[3]

    await governance
      .connect(bob)
      .propose(inflationVote, rewardVote, 0, 0, '1000000000000000000', '')

    await time.increase(3600 * 24 * 10.1)

    const bobvote = [
      ethers.utils.randomBytes(32),
      await bob.getAddress(),
      [await bob.getAddress()],
    ]
    await governance.connect(bob).commit(getCommit(...bobvote))
    const charlievote = [
      ethers.utils.randomBytes(32),
      await charlie.getAddress(),
      [await bob.getAddress()],
    ]
    await governance.connect(charlie).commit(getCommit(...charlievote))
    const davevote = [
      ethers.utils.randomBytes(32),
      await dave.getAddress(),
      [await bob.getAddress()],
    ]
    await governance.connect(dave).commit(getCommit(...davevote))
    await time.increase(3600 * 24 * 3)
    await governance
      .connect(bob)
      .reveal(bobvote[0], getFormattedBallot(bobvote[2]))
    await governance
      .connect(charlie)
      .reveal(charlievote[0], getFormattedBallot(charlievote[2]))
    await governance
      .connect(dave)
      .reveal(davevote[0], getFormattedBallot(davevote[2]))
    await time.increase(3600 * 24 * 1)
    await governance.updateStage()
    await governance.compute()
    await time.increase(3600 * 24 * 3)
    const generation = await currencyTimer.currentGeneration()
    await timedPolicies.incrementGeneration()
    const inflationAddr = await currencyTimer.randomInflations(generation)
    inflation = await ethers.getContractAt('RandomInflation', inflationAddr)
    vdf = await ethers.getContractAt(
      'VDFVerifier',
      await inflation.vdfVerifier()
    )
    await configureInflationRootHash()
  })

  describe('policyProposals totalVotingPower', () => {
    beforeEach(async () => {
      policyProposals = await ethers.getContractAt(
        'PolicyProposals',
        await policyFor(
          policy,
          ethers.utils.solidityKeccak256(['string'], ['PolicyProposals'])
        )
      )
    })
    it('excludes randomInflation mint from totalVotingPower at blockNumber', async () => {
      const ecoXsupply = await ecox.totalSupply()
      await expect(
        await policyProposals.totalVotingPower(
          await policyProposals.blockNumber()
        )
      ).to.equal(preInflationEcoSupply.add(ecoXsupply.mul(10))) // 10x voting power mult
    })
  })

  describe('startInflation', () => {
    it('reverts if startInflation is called with zero value _numRecipients', async () => {
      await expect(inflation.startInflation(0, 1)).to.be.revertedWith(
        'Contract must have rewards'
      )
    })

    it('reverts if startInflation is called with zero value _reward', async () => {
      await expect(inflation.startInflation(1, 0)).to.be.revertedWith(
        'Contract must have rewards'
      )
    })

    it('reverts if contract doesnt have the required funds to reward chosen recipients', async () => {
      await expect(
        inflation.startInflation(1000000000, 1000000000)
      ).to.be.revertedWith(
        'The contract must have a token balance at least the total rewards'
      )
    })

    it('reverts if startInflation is called twice', async () => {
      await expect(inflation.startInflation(1, 1)).to.be.revertedWith(
        'The sale can only be started once'
      )
    })
  })

  describe('blockNumber', () => {
    it('doesnt have a balance at block blockNumber', async () => {
      await expect(
        await eco.getPastVotes(inflation.address, await inflation.blockNumber())
      ).to.equal(0)
    })

    it('has a balance at block blockNumber + 1', async () => {
      await expect(
        await eco.getPastVotes(
          inflation.address,
          (await inflation.blockNumber()).add(1)
        )
      ).to.not.equal(0)
    })
  })

  describe('commitEntropyVDF', () => {
    it('should revert on uncommited primal', async () => {
      await expect(
        inflation.commitEntropyVDFSeed(await getPrimal())
      ).to.be.revertedWith('primal block invalid')
    })

    it('should revert on primal commited in same block', async () => {
      await inflation.setPrimal(await getPrimal())

      await expect(
        inflation.commitEntropyVDFSeed(await getPrimal())
      ).to.be.revertedWith('primal block invalid')
    })

    it('should emit EntropyVDFSeedCommit event on success', async () => {
      //      time.increase(3600 * 24 * 2);
      const primal = await getPrimal()
      await inflation.setPrimal(primal)
      await time.advanceBlocks(1)
      await expect(inflation.commitEntropyVDFSeed(primal)).to.emit(
        inflation,
        'EntropyVDFSeedCommit'
      )
    })

    it('should reverts when called twice', async () => {
      //      time.increase(3600 * 24 * 2);
      const primal = await getPrimal()
      await inflation.setPrimal(primal)
      await time.advanceBlocks(1)
      await inflation.commitEntropyVDFSeed(primal)

      await expect(inflation.commitEntropyVDFSeed(primal)).to.be.revertedWith(
        'The VDF seed has already been set'
      )
    })
  })

  describe('submitEntropyVDF', () => {
    it('reverts when the seed has not been set', async () => {
      await expect(inflation.submitEntropyVDF(1)).to.be.revertedWith(
        'Initial seed must be set'
      )
    })

    it("reverts when the VDF isn't proven", async () => {
      //      await time.increase(3600 * 24 * 2);
      const primal = await getPrimal()
      await inflation.setPrimal(primal)
      await time.advanceBlocks(1)
      await inflation.commitEntropyVDFSeed(primal)

      await expect(inflation.submitEntropyVDF(1)).to.be.revertedWith(
        'The VDF output value must be verified by the VDF verification contract'
      )
    })

    context('when correctly submitting a proven VDF', () => {
      let y

      beforeEach(async () => {
        //        await time.increase(3600 * 24 * 2);
        const primal = await getPrimal()
        await inflation.setPrimal(primal)
        await time.advanceBlocks(1)
        await inflation.commitEntropyVDFSeed(primal)
        let u
        const vdfseed = BigNumber.from(
          (await inflation.entropyVDFSeed()).toHexString()
        )
        const t = await inflation.randomVDFDifficulty()
        ;[y, u] = prove(vdfseed, t)

        await vdf.start(bnHex(vdfseed), t, bnHex(y))
        for (let i = 0; i < u.length; i += 1) {
          await vdf.update(bnHex(u[i]))
        }
      })

      it('emits the EntropySeedReveal event', async () => {
        await expect(inflation.submitEntropyVDF(bnHex(y))).to.emit(
          inflation,
          'EntropySeedReveal'
        )
      })

      it('reverts when submitted multiple times', async () => {
        await inflation.submitEntropyVDF(bnHex(y))

        await expect(inflation.submitEntropyVDF(bnHex(y))).to.be.revertedWith(
          'Can only submit once'
        )
      })
    })
  })

  describe('claim', () => {
    beforeEach(async () => {
      const primal = await getPrimal()
      await inflation.setPrimal(primal)
      await time.advanceBlocks(1)
      await inflation.commitEntropyVDFSeed(primal)
    })

    context('but before the VDF is complete', () => {
      it('rejects any claims', async () => {
        const a = answer(tree, 0)
        await expect(
          inflation.connect(accounts[0]).claim(0, a[1].reverse(), a[0].sum, 0)
        ).to.be.revertedWith('Must prove VDF before claims can be paid')
      })
    })

    context('after the VDF is complete', () => {
      beforeEach(async () => {
        const vdfseed = BigNumber.from(
          (await inflation.entropyVDFSeed()).toHexString()
        )
        const t = await inflation.randomVDFDifficulty()
        const [y, u] = prove(vdfseed, t)

        await vdf.start(bnHex(vdfseed), t, bnHex(y))
        for (let i = 0; i < u.length; i += 1) {
          await vdf.update(bnHex(u[i]))
        }
        await inflation.submitEntropyVDF(bnHex(y))
      })

      it('pays out inflation', async () => {
        const [a, index, recipient] = await getClaimParameters(inflation, 0)

        const beforeBalance = await eco.balanceOf(recipient.getAddress())
        const tx = await inflation
          .connect(recipient)
          .claim(0, a[1].reverse(), a[0].sum, index)
        const receipt = await tx.wait()
        console.log(`gas used ${receipt.gasUsed}`)
        const afterBalance = await eco.balanceOf(recipient.getAddress())
        expect(afterBalance.sub(beforeBalance)).to.equal(rewardVote)
      })

      it('emits the Claim event', async () => {
        await time.increase(3600 * 24 * 10 + 1)
        const [a, index, recipient] = await getClaimParameters(inflation, 3)
        await expect(
          inflation.connect(recipient).claim(3, a[1].reverse(), a[0].sum, index)
        )
          .to.emit(inflation, 'Claim')
          .withArgs(await recipient.getAddress(), 3)
      })

      context('reverts when called with a non-chosen claimNumber', async () => {
        it('sequence is not in numRecipients', async () => {
          const numRecipients = await inflation.numRecipients()
          const [a, index, recipient] = await getClaimParameters(inflation, 2)
          await expect(
            inflation
              .connect(recipient)
              .claim(numRecipients, a[1].reverse(), a[0].sum, index)
          ).to.be.revertedWith(
            'The provided sequence number must be within the set of recipients'
          )
        })

        it('fail root hash verification', async () => {
          const [a, index, recipient] = await getClaimParameters(inflation, 2)
          await expect(
            inflation
              .connect(recipient)
              .claim(0, a[1].reverse(), a[0].sum + 1000000, index)
          ).to.be.revertedWith(
            'A claim submission failed root hash verification'
          )
        })
      })

      it('reverts when called for the next period', async () => {
        const [a, index, recipient] = await getClaimParameters(inflation, 1000)
        await expect(
          inflation.connect(recipient).claim(3, a[1].reverse(), a[0].sum, index)
        ).to.be.revertedWith(
          'A claim can only be made after enough time has passed'
        )
      })

      context('when already called this period', () => {
        beforeEach(async () => {
          const [a, index, recipient] = await getClaimParameters(inflation, 0)
          await inflation
            .connect(recipient)
            .claim(0, a[1].reverse(), a[0].sum, index)
        })

        it('reverts', async () => {
          const [a, index, recipient] = await getClaimParameters(inflation, 0)
          await expect(
            inflation
              .connect(recipient)
              .claim(0, a[1].reverse(), a[0].sum, index)
          ).to.be.revertedWith(
            'A claim can only be made if it has not already been made'
          )
        })
      })

      context('after one inflation period', () => {
        const updatedMap = new Map()
        beforeEach(async () => {
          for (let i = 0; i < 3; i += 1) {
            updatedMap.set(
              await accounts[i].getAddress(),
              BigNumber.from(
                (
                  await eco.balanceOf(await accounts[i].getAddress())
                ).toHexString()
              )
            )
          }
          const [a, index, recipient] = await getClaimParameters(inflation, 0)
          updatedMap.set(
            await recipient.getAddress(),
            updatedMap
              .get(await recipient.getAddress())
              .add(BigNumber.from(rewardVote))
          )
          await inflation
            .connect(recipient)
            .claim(0, a[1].reverse(), a[0].sum, index)
          await time.increase(3600 * 24 * 30)
        })

        it('pays out more inflation', async () => {
          for (let i = 1; i <= 9; i += 1) {
            const [a, index, recipient] = await getClaimParameters(inflation, i)
            updatedMap.set(
              await recipient.getAddress(),
              updatedMap
                .get(await recipient.getAddress())
                .add(BigNumber.from(rewardVote))
            )
            await inflation
              .connect(recipient)
              .claim(i, a[1].reverse(), a[0].sum, index)
            expect(await eco.balanceOf(await recipient.getAddress())).to.equal(
              updatedMap.get(await recipient.getAddress())
            )
          }
        })
      })
    })
  })

  describe('destruct', () => {
    // I kind of just want to remove the destruct function.
    // I don't really think it does anything useful at this point.

    context('before seed reveal', () => {
      it('reverts', async () => {
        await expect(inflation.destruct()).to.be.revertedWith(
          'Entropy not set, wait until end of full claim period to abort'
        )
      })

      it('is still callable after waiting the full time', async () => {
        await time.increase(3600 * 24 * 28 + 1)
        await inflation.destruct()
      })
    })

    context('after the results are computed', () => {
      beforeEach(async () => {
        const primal = await getPrimal()
        await inflation.setPrimal(primal)
        await time.advanceBlocks(1)
        await inflation.commitEntropyVDFSeed(primal)
      })

      context('with VDF, basic flow', () => {
        beforeEach(async () => {
          const vdfseed = BigNumber.from(
            (await inflation.entropyVDFSeed()).toHexString()
          )
          const t = await inflation.randomVDFDifficulty()
          const [y, u] = prove(vdfseed, t)

          await vdf.start(bnHex(vdfseed), t, bnHex(y))
          for (let i = 0; i < u.length; i += 1) {
            await vdf.update(bnHex(u[i]))
          }
          await inflation.submitEntropyVDF(bnHex(y))
          const numRecipients = await inflation.numRecipients()
          for (let i = 0; i < numRecipients; i += 1) {
            await time.increase(3600 * 24 * 8 + 1)
            const [a, index, recipient] = await getClaimParameters(inflation, i)
            await inflation
              .connect(recipient)
              .claim(i, a[1].reverse(), a[0].sum, index)
          }
        })

        it('succeeds', async () => {
          await inflation.destruct()
        })

        it('burns the minted tokens', async () => {
          await inflation.destruct()

          expect(await eco.balanceOf(inflation.address)).to.equal(0)
        })
      })

      context('with a VDF solution', () => {
        beforeEach(async () => {
          const vdfseed = BigNumber.from(
            (await inflation.entropyVDFSeed()).toHexString()
          )
          const t = await inflation.randomVDFDifficulty()
          const [y, u] = prove(vdfseed, t)

          await vdf.start(bnHex(vdfseed), t, bnHex(y))
          for (let i = 0; i < u.length; i += 1) {
            await vdf.update(bnHex(u[i]))
          }

          await inflation.submitEntropyVDF(bnHex(y))
        })

        context('and claimNumbers have not been paid out', () => {
          it('reverts', async () => {
            await expect(inflation.destruct()).to.be.revertedWith(
              'All rewards must be claimed prior to destruct'
            )
          })

          context('after a long time', () => {
            beforeEach(async () => {
              await time.increase(3600 * 24 * 30)
            })

            it('still reverts', async () => {
              await expect(inflation.destruct()).to.be.revertedWith(
                'All rewards must be claimed prior to destruct'
              )
            })
          })
        })

        context('and claimNumbers have been paid out', () => {
          beforeEach(async () => {
            await time.increase(3600 * 24 * 30)

            const numRecipients = (await inflation.numRecipients()).toNumber()

            await Promise.all(
              [accounts[0], accounts[1]].map(async () => {
                for (let i = 0; i < numRecipients; i += 1) {
                  try {
                    const [a, index, recipient] = await getClaimParameters(
                      inflation,
                      i
                    )
                    await inflation
                      .connect(recipient)
                      .claim(i, a[1].reverse(), a[0].sum, index)
                  } catch (e) {
                    if (
                      !e.message.includes('provided address does not hold') &&
                      !e.message.includes('not already been made')
                    ) {
                      throw e
                    }
                  }
                }
              })
            )
          })

          it('succeeds', async () => {
            await inflation.destruct()
          })

          context('after destructing', () => {
            beforeEach(async () => {
              await inflation.destruct()
            })

            it('has no leftover tokens', async () => {
              expect(await eco.balanceOf(inflation.address)).to.equal(0)
            })

            it('is no longer the inflation policy', async () => {
              const govhash = ethers.utils.solidityKeccak256(
                ['string'],
                ['CurrencyGovernance']
              )

              expect(await policyFor(policy, govhash)).to.not.equal(
                inflation.address
              )
            })
          })
        })
      })
    })
  })
})
