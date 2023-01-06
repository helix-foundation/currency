/* eslint no-loop-func: 0 */
/* eslint no-await-in-loop: 0 */
/* eslint no-empty: 0 */
/* eslint no-bitwise: 0 */
/* eslint no-return-await: 0 */
const { expect } = require('chai')

const time = require('../utils/time.ts')
const { BigNumber } = ethers
const {
  getTree,
  answer,
  getRandomIntInclusive,
  getRandomIntInclusiveEven,
  getRandomIntInclusiveOdd,
} = require('../../tools/randomInflationUtils')
const {
  getCommit,
  getFormattedBallot,
} = require('../../tools/test/currencyGovernanceVote')

const { ecoFixture, policyFor } = require('../utils/fixtures')

describe('InflationRootHashProposal', () => {
  let rootHashProposal
  let initInflation
  let timedPolicies
  let currencyTimer
  let eco
  let accounts
  let inflation
  let policy

  const inflationVote = 10
  const rewardVote = 20000

  before(async () => {
    const originalAccounts = await ethers.getSigners()
    let comparableAccounts = await Promise.all(
      (await ethers.getSigners()).map(async (s) => [await s.getAddress(), s])
    )
    comparableAccounts = comparableAccounts.sort((a, b) =>
      a[0].localeCompare(b[0])
    )
    accounts = comparableAccounts.map((a) => a[1])
    for (let i = 0; i < originalAccounts.length; i += 1) {
      await originalAccounts[i].sendTransaction({
        to: await accounts[i].getAddress(),
        value: ethers.utils.parseEther('40'),
      })
    }
  })

  const ecoBalance = async (account) =>
    await eco.balanceOf(await account.getAddress())

  beforeEach('global setup', async () => {
    const [, bob, charlie, dave] = accounts
    const trustees = [
      await bob.getAddress(),
      await charlie.getAddress(),
      await dave.getAddress(),
    ]

    ;({
      policy,
      eco,
      faucet: initInflation,
      timedPolicies,
      currencyTimer,
      rootHashProposal,
      inflation,
    } = await ecoFixture(trustees))
  })

  async function verifyOnChain(tree, index, proposer) {
    const a = answer(tree, index)
    await rootHashProposal
      .connect(accounts[1])
      .challengeRootHashRequestAccount(await proposer.getAddress(), index)
    await rootHashProposal
      .connect(proposer)
      .respondToChallenge(
        await accounts[1].getAddress(),
        a[1].reverse(),
        a[0].account,
        a[0].balance,
        a[0].sum,
        index
      )
    return true
  }

  async function claimMissingOnChain(account, index, proposer) {
    try {
      await expect(
        rootHashProposal
          .connect(accounts[1])
          .claimMissingAccount(proposer, index, account)
      )
        .to.emit(rootHashProposal, 'ChallengeMissingAccountSuccess')
        .to.emit(rootHashProposal, 'RootHashRejection')
      return true
    } catch (e) {
      return false
    }
  }

  async function interrogateOnChain(auth, victim, proposer) {
    let index = 0
    if (victim.hash === auth.hash) {
      return [true, 0]
    }

    for (let k = 0; k < 50; k += 1) {
      const mine = answer(auth, index)
      const theirs = answer(victim, index)

      try {
        await verifyOnChain(victim, index, proposer)
      } catch (e) {
        return [false, k]
      }

      if (theirs[0].account > mine[0].account) {
        if (index > 0) {
          k += 1
          try {
            await verifyOnChain(victim, index - 1, proposer)
          } catch (e) {
            return [false, k]
          }
        }
        if (!(await claimMissingOnChain(mine[0].account, index, proposer))) {
        } else {
          return [false, k]
        }
      }

      for (let i = 0; i < mine[1].length; i += 1) {
        const a = mine[1][mine[1].length - i - 1]
        const b = theirs[1][theirs[1].length - i - 1]
        if (a !== b) {
          index += 1 << i
          break
        }
      }
    }
    return [true, 1000]
  }

  async function getRootHash() {
    const [, bob, charlie, dave] = accounts

    const governance = await ethers.getContractAt(
      'CurrencyGovernance',
      await policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
      )
    )

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
    const addressRootHashProposal = await inflation.inflationRootHashProposal()
    for (let i = 0; i < 10; i += 1) {
      eco
        .connect(accounts[i])
        .approve(
          addressRootHashProposal,
          (await eco.balanceOf(await accounts[i].getAddress())).mul(
            BigNumber.from(100)
          )
        )
    }
    return await ethers.getContractAt(
      'InflationRootHashProposal',
      addressRootHashProposal
    )
  }

  context('manual tests', () => {
    const totalSum = BigNumber.from('300000000000000000000000000')
    const amountOfAccounts = 3
    let tree
    let proposedRootHash
    let map
    beforeEach(async () => {
      map = new Map([
        [
          await accounts[0].getAddress(),
          BigNumber.from('50000000000000000000000000'),
        ],
        [
          await accounts[1].getAddress(),
          BigNumber.from('100000000000000000000000000'),
        ],
        [
          await accounts[2].getAddress(),
          BigNumber.from('150000000000000000000000000'),
        ],
      ])
      await initInflation.mint(
        await accounts[0].getAddress(),
        '50000000000000000000000000'
      )
      await initInflation.mint(
        await accounts[1].getAddress(),
        '100000000000000000000000000'
      )
      await initInflation.mint(
        await accounts[2].getAddress(),
        '150000000000000000000000000'
      )

      await initInflation.mint(policy.address, '100000000000000000000000000')
      await initInflation.mint(
        await rootHashProposal.POOL_ADDRESS(),
        '150000000000000000000000000'
      )
      await initInflation.mint(
        await rootHashProposal.ECO_ASSOCIATION1(),
        '10000000000000000000000000'
      )
      await initInflation.mint(
        await rootHashProposal.ECO_ASSOCIATION2(),
        '20000000000000000000000000'
      )
      await initInflation.mint(
        await rootHashProposal.ECO_INC(),
        '30000000000000000000000000'
      )
      await time.advanceBlock()

      tree = getTree(map)
      proposedRootHash = tree.hash
      rootHashProposal = await getRootHash()

      await expect(
        rootHashProposal
          .connect(accounts[0])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts)
      )
        .to.emit(rootHashProposal, 'RootHashPost')
        .withArgs(
          await accounts[0].getAddress(),
          proposedRootHash,
          totalSum,
          amountOfAccounts
        )
    })

    context('basic cases', () => {
      it('challenge submitted', async () => {
        const requestedIndex = 0
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(
              await accounts[0].getAddress(),
              requestedIndex
            )
        )
          .to.emit(rootHashProposal, 'RootHashChallengeIndexRequest')
          .withArgs(
            await accounts[0].getAddress(),
            await accounts[1].getAddress(),
            requestedIndex
          )
      })

      it('challenge submitted and cannot be repeated', async () => {
        const requestedIndex = 0
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(
            await accounts[0].getAddress(),
            requestedIndex
          )
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(
              await accounts[0].getAddress(),
              requestedIndex
            )
        ).to.be.revertedWith('Index already challenged')
      })

      it('challenge responded successfully', async () => {
        const requestedIndex = 2
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(
            await accounts[0].getAddress(),
            requestedIndex
          )
        const a = answer(tree, requestedIndex)
        await expect(
          rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[1].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        )
          .to.emit(rootHashProposal, 'ChallengeSuccessResponse')
          .withArgs(
            await accounts[0].getAddress(),
            await accounts[1].getAddress(),
            a[0].account,
            a[0].balance,
            a[0].sum,
            requestedIndex
          )
      })

      it('challenge responding deep in empty part of tree successfully', async () => {
        const _totalSum = BigNumber.from('1150000000000000000000000000')
        const _amountOfAccounts = 11
        map = new Map([
          [
            await accounts[0].getAddress(),
            BigNumber.from('50000000000000000000000000'),
          ],
          [
            await accounts[1].getAddress(),
            BigNumber.from('100000000000000000000000000'),
          ],
          [
            await accounts[2].getAddress(),
            BigNumber.from('150000000000000000000000000'),
          ],
          [
            await accounts[3].getAddress(),
            BigNumber.from('50000000000000000000000000'),
          ],
          [
            await accounts[4].getAddress(),
            BigNumber.from('100000000000000000000000000'),
          ],
          [
            await accounts[5].getAddress(),
            BigNumber.from('150000000000000000000000000'),
          ],
          [
            await accounts[6].getAddress(),
            BigNumber.from('50000000000000000000000000'),
          ],
          [
            await accounts[7].getAddress(),
            BigNumber.from('100000000000000000000000000'),
          ],
          [
            await accounts[8].getAddress(),
            BigNumber.from('150000000000000000000000000'),
          ],
          [
            await accounts[9].getAddress(),
            BigNumber.from('100000000000000000000000000'),
          ],
          [
            await accounts[10].getAddress(),
            BigNumber.from('150000000000000000000000000'),
          ],
        ])
        await initInflation.mint(
          await accounts[3].getAddress(),
          '50000000000000000000000000'
        )
        await initInflation.mint(
          await accounts[4].getAddress(),
          '100000000000000000000000000'
        )
        await initInflation.mint(
          await accounts[5].getAddress(),
          '150000000000000000000000000'
        )
        await initInflation.mint(
          await accounts[6].getAddress(),
          '50000000000000000000000000'
        )
        await initInflation.mint(
          await accounts[7].getAddress(),
          '100000000000000000000000000'
        )
        await initInflation.mint(
          await accounts[8].getAddress(),
          '150000000000000000000000000'
        )
        await initInflation.mint(
          await accounts[9].getAddress(),
          '100000000000000000000000000'
        )
        await initInflation.mint(
          await accounts[10].getAddress(),
          '150000000000000000000000000'
        )
        await time.advanceBlock()

        tree = getTree(map)
        proposedRootHash = tree.hash
        rootHashProposal = await getRootHash()

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .proposeRootHash(proposedRootHash, _totalSum, _amountOfAccounts)
        )
          .to.emit(rootHashProposal, 'RootHashPost')
          .withArgs(
            await accounts[1].getAddress(),
            proposedRootHash,
            _totalSum,
            _amountOfAccounts
          )

        const requestedIndex = 10
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(
            await accounts[1].getAddress(),
            requestedIndex
          )
        const a = answer(tree, requestedIndex)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        )
          .to.emit(rootHashProposal, 'ChallengeSuccessResponse')
          .withArgs(
            await accounts[1].getAddress(),
            await accounts[2].getAddress(),
            a[0].account,
            a[0].balance,
            a[0].sum,
            requestedIndex
          )
      })

      it('cannot re-challenge after successful response', async () => {
        const requestedIndex = 2
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(
            await accounts[0].getAddress(),
            requestedIndex
          )
        const a = answer(tree, 2)
        await rootHashProposal
          .connect(accounts[0])
          .respondToChallenge(
            await accounts[1].getAddress(),
            a[1].reverse(),
            a[0].account,
            a[0].balance,
            a[0].sum,
            requestedIndex
          )
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(
              await accounts[0].getAddress(),
              requestedIndex
            )
        ).to.be.revertedWith('Index already challenged')
      })

      it('catches balance cheats', async () => {
        const cheat = new Map(map)
        const cheatBalance = BigNumber.from('200000000000000000000000000')
        cheat.set(await accounts[3].getAddress(), cheatBalance)
        const ct = getTree(cheat)
        proposedRootHash = ct.hash
        await rootHashProposal
          .connect(accounts[2])
          .proposeRootHash(
            proposedRootHash,
            totalSum.add(cheatBalance),
            amountOfAccounts + 1
          )
        expect(await verifyOnChain(ct, 2, accounts[2]))
        expect(await verifyOnChain(ct, 1, accounts[2]))
        expect(await verifyOnChain(ct, 0, accounts[2]))
        await expect(verifyOnChain(ct, 3, accounts[2])).to.be.revertedWith(
          'Challenge response failed account balance check'
        )
      })

      it('catches filler accounts', async () => {
        const cheat = new Map(map)
        const cheatBalance = BigNumber.from('0')
        cheat.set(await accounts[3].getAddress(), cheatBalance)
        const ct = getTree(cheat)
        proposedRootHash = ct.hash
        await rootHashProposal
          .connect(accounts[2])
          .proposeRootHash(
            proposedRootHash,
            totalSum.add(cheatBalance),
            amountOfAccounts + 1
          )
        expect(await verifyOnChain(ct, 2, accounts[2]))
        expect(await verifyOnChain(ct, 1, accounts[2]))
        expect(await verifyOnChain(ct, 0, accounts[2]))
        await expect(verifyOnChain(ct, 3, accounts[2])).to.be.revertedWith(
          'Accounts with zero balance not allowed in Merkle tree'
        )
      })

      it('doesnt allow double configuration', async () => {
        await expect(rootHashProposal.configure(1)).to.be.revertedWith(
          'This instance has already been configured'
        )
      })

      it('doesnt allow double proposal', async () => {
        await expect(
          rootHashProposal
            .connect(accounts[0])
            .proposeRootHash(
              proposedRootHash,
              BigNumber.from('250000000000000000000000000'),
              3
            )
        ).to.be.revertedWith('Root hash already proposed')
      })

      it('doesnt allow num accounts of zero', async () => {
        const tree = getTree(map)
        proposedRootHash = tree.hash

        await expect(
          rootHashProposal
            .connect(accounts[2])
            .proposeRootHash(
              proposedRootHash,
              BigNumber.from('250000000000000000000000000'),
              0
            )
        ).to.be.revertedWith('Hash must consist of at least 1 account')
      })

      it('missing account', async () => {
        const cheat = new Map(map)
        cheat.delete(await accounts[1].getAddress())
        const ct = getTree(cheat)
        proposedRootHash = ct.hash

        await rootHashProposal
          .connect(accounts[2])
          .proposeRootHash(
            proposedRootHash,
            BigNumber.from('200000000000000000000000000'),
            2
          )

        await verifyOnChain(ct, 0, accounts[2])
        await verifyOnChain(ct, 1, accounts[2])
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[2].getAddress(),
              1,
              await accounts[1].getAddress()
            )
        )
          .to.emit(rootHashProposal, 'ChallengeMissingAccountSuccess')
          .to.emit(rootHashProposal, 'RootHashRejection')
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[2].getAddress(),
              1,
              await accounts[1].getAddress()
            )
        ).to.be.revertedWith('The proposal is resolved')
      })
    })

    context('specific cases', () => {
      it('does not accept challenges from root hash proposer', async () => {
        await expect(
          rootHashProposal
            .connect(accounts[0])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), 0)
        ).to.be.revertedWith(
          "Root hash proposer can't challenge its own submission"
        )
      })

      it('does not accept response not from original proposer', async () => {
        const requestedIndex = 2
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(
            await accounts[0].getAddress(),
            requestedIndex
          )

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(
              await accounts[0].getAddress(),
              requestedIndex
            )
        ).to.be.revertedWith('Index already challenged')
      })

      it('does not accept response to not existing challenge', async () => {
        const requestedIndex = 2
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(
            await accounts[0].getAddress(),
            requestedIndex
          )
        const a = answer(tree, 2)
        await expect(
          rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[1].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex + 1100
            )
        ).to.be.revertedWith('There is no pending challenge for this index')
      })

      it('does not accept challenge to nonexistent proposal', async () => {
        const requestedIndex = 2
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(
              await accounts[5].getAddress(),
              requestedIndex
            )
        ).to.be.revertedWith('There is no such hash proposal')
      })

      it('does not accept challengeRootHashRequestAccount for index greater or equal to the number of accounts', async () => {
        const requestedIndex = amountOfAccounts

        // suceeds
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(
            await accounts[0].getAddress(),
            requestedIndex - 1
          )

        // all revert
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(
              await accounts[0].getAddress(),
              requestedIndex
            )
        ).to.be.revertedWith('may only request an index within the tree')

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(
              await accounts[0].getAddress(),
              requestedIndex + 1
            )
        ).to.be.revertedWith('may only request an index within the tree')

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(
              await accounts[0].getAddress(),
              requestedIndex + 400
            )
        ).to.be.revertedWith('may only request an index within the tree')
      })

      it('does not accept claimMissingAccount for index greater or equal to the number of accounts', async () => {
        const requestedIndex = amountOfAccounts

        // this is in range, reverts on a following revert
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex,
              await accounts[2].getAddress()
            )
        ).to.be.revertedWith('Submit Index Request first')

        // these are out of range
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex + 1,
              await accounts[2].getAddress()
            )
        ).to.be.revertedWith(
          'missing account position must be to the left of the submitted index'
        )

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex + 400,
              await accounts[2].getAddress()
            )
        ).to.be.revertedWith(
          'missing account position must be to the left of the submitted index'
        )
      })

      it('first account missing', async () => {
        const cheat = new Map(map)
        cheat.delete(await accounts[0].getAddress())
        const ct = getTree(cheat)
        proposedRootHash = ct.hash

        await rootHashProposal
          .connect(accounts[2])
          .proposeRootHash(
            proposedRootHash,
            BigNumber.from('250000000000000000000000000'),
            2
          )

        // expect(await verifyOnChain(ct, 0, accounts[2])).to.be.true
        // expect(await verifyOnChain(ct, 1, accounts[2])).to.be.true
        await verifyOnChain(ct, 0, accounts[2])
        await verifyOnChain(ct, 1, accounts[2])
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[2].getAddress(),
              0,
              await accounts[0].getAddress()
            )
        )
          .to.emit(rootHashProposal, 'ChallengeMissingAccountSuccess')
          .to.emit(rootHashProposal, 'RootHashRejection')
      })

      it('last account missing', async () => {
        const cheat = new Map(map)
        cheat.delete(await accounts[amountOfAccounts - 1].getAddress())
        const ct = getTree(cheat)
        proposedRootHash = ct.hash

        await rootHashProposal
          .connect(accounts[2])
          .proposeRootHash(
            proposedRootHash,
            BigNumber.from('150000000000000000000000000'),
            2
          )

        // expect(await verifyOnChain(ct, 0, accounts[2])).to.be.true
        // expect(await verifyOnChain(ct, 1, accounts[2])).to.be.true
        await verifyOnChain(ct, 0, accounts[2])
        await verifyOnChain(ct, 1, accounts[2])
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[2].getAddress(),
              2,
              await accounts[amountOfAccounts - 1].getAddress()
            )
        )
          .to.emit(rootHashProposal, 'ChallengeMissingAccountSuccess')
          .to.emit(rootHashProposal, 'RootHashRejection')
      })

      it('cannot defend challenges on blacklisted addresses', async () => {
        const POOL_ADDRESS = await rootHashProposal.POOL_ADDRESS()
        const ECO_ASSOCIATION1 = await rootHashProposal.ECO_ASSOCIATION1()
        const ECO_ASSOCIATION2 = await rootHashProposal.ECO_ASSOCIATION2()
        const ECO_INC = await rootHashProposal.ECO_INC()

        const revertMsgs = [
          'zero',
          'pool',
          'association',
          'association',
          'eco inc',
        ]
        const blacklist = [
          ethers.constants.AddressZero,
          POOL_ADDRESS,
          ECO_ASSOCIATION1,
          ECO_ASSOCIATION2,
          ECO_INC,
          policy.address,
        ] // all but the policy is sorted
        blacklist.sort()
        const policyIndex = blacklist.findIndex((a) => a === policy.address)
        revertMsgs.splice(policyIndex, 0, 'policy') // in place splicing

        map = new Map([
          [
            ethers.constants.AddressZero,
            BigNumber.from('50000000000000000000000000'),
          ],
          [policy.address, BigNumber.from('100000000000000000000000000')],
          [POOL_ADDRESS, BigNumber.from('150000000000000000000000000')],
          [ECO_ASSOCIATION1, BigNumber.from('10000000000000000000000000')],
          [ECO_ASSOCIATION2, BigNumber.from('20000000000000000000000000')],
          [ECO_INC, BigNumber.from('30000000000000000000000000')],
        ])
        tree = getTree(map)
        proposedRootHash = tree.hash

        await rootHashProposal
          .connect(accounts[2])
          .proposeRootHash(
            proposedRootHash,
            BigNumber.from('360000000000000000000000000'),
            revertMsgs.length
          )

        for (let i = 0; i < revertMsgs.length; i++) {
          await rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(await accounts[2].getAddress(), i)
          const a = answer(tree, i)

          await expect(
            rootHashProposal
              .connect(accounts[2])
              .respondToChallenge(
                await accounts[1].getAddress(),
                a[1].reverse(),
                a[0].account,
                a[0].balance,
                a[0].sum,
                i
              )
          ).to.be.revertedWith(
            `The ${revertMsgs[i]} address not allowed in Merkle tree`
          )
        }
      })

      it('cannot claimMissingAccount for blacklisted addresses', async () => {
        const POOL_ADDRESS = await rootHashProposal.POOL_ADDRESS()
        const ECO_ASSOCIATION1 = await rootHashProposal.ECO_ASSOCIATION1()
        const ECO_ASSOCIATION2 = await rootHashProposal.ECO_ASSOCIATION2()
        const ECO_INC = await rootHashProposal.ECO_INC()
        const addresses = [
          await accounts[0].getAddress(),
          await accounts[1].getAddress(),
          await accounts[2].getAddress(),
        ]
        const poolArray = addresses.slice()
        poolArray.push(POOL_ADDRESS)
        const poolPos = poolArray.sort().indexOf(POOL_ADDRESS)

        const association1Array = addresses.slice()
        association1Array.push(ECO_ASSOCIATION1)
        const association1Pos = association1Array
          .sort()
          .indexOf(ECO_ASSOCIATION1)

        const association2Array = addresses.slice()
        association2Array.push(ECO_ASSOCIATION2)
        const association2Pos = association2Array
          .sort()
          .indexOf(ECO_ASSOCIATION2)

        const ecoIncArray = addresses.slice()
        ecoIncArray.push(ECO_INC)
        const ecoIncPos = ecoIncArray.sort().indexOf(ECO_INC)

        const policyArray = addresses.slice()
        policyArray.push(policy.address)
        const policyPos = policyArray.sort().indexOf(policy.address)

        for (let i = 0; i < 3; i++) {
          await rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), i)
          const a = answer(tree, i)

          await rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[1].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              i
            )
        }

        /*
         * cannot actually test the same revert with the zero address as you
         * cannot give voting power to the zero address currently
         */

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              poolPos,
              POOL_ADDRESS
            )
        ).to.be.revertedWith('The pool address not allowed in Merkle tree')

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              association1Pos,
              ECO_ASSOCIATION1
            )
        ).to.be.revertedWith(
          'The association address not allowed in Merkle tree'
        )

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              association2Pos,
              ECO_ASSOCIATION2
            )
        ).to.be.revertedWith(
          'The association address not allowed in Merkle tree'
        )

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              ecoIncPos,
              ECO_INC
            )
        ).to.be.revertedWith('The eco inc address not allowed in Merkle tree')

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              policyPos,
              policy.address
            )
        ).to.be.revertedWith('The policy address not allowed in Merkle tree')
      })

      it('cannot checkRootHashStatus for uninitialized root hash', async () => {
        const unproposedAccount = await accounts[4].getAddress()
        await expect(
          rootHashProposal.checkRootHashStatus(unproposedAccount)
        ).to.be.revertedWith('No such proposal')
        const proposal = await rootHashProposal.rootHashProposals(
          unproposedAccount
        )
        expect(proposal.status === 0).to.be.true
        expect(!proposal.initialized).to.be.true
      })

      it('cannot claimFee for uninitialized proposals', async () => {
        const unproposedAccount = await accounts[4].getAddress()
        await expect(
          rootHashProposal.claimFee(unproposedAccount)
        ).to.be.revertedWith('No such proposal')
      })

      it('cannot claimFee for uninitialized proposals', async () => {
        await expect(
          rootHashProposal.claimFee(await accounts[0].getAddress())
        ).to.be.revertedWith('Cannot claimFee on pending proposal')
      })
    })

    context('verify challenge white box testing', async () => {
      it('fail balance check', async () => {
        await initInflation.mint(
          await accounts[2].getAddress(),
          '150000000000000000000000000'
        )

        rootHashProposal = await getRootHash()
        await rootHashProposal
          .connect(accounts[0])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts)

        const requestedIndex = 2
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(
            await accounts[0].getAddress(),
            requestedIndex
          )
        const a = answer(tree, 2)
        await expect(
          rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[1].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        ).to.be.revertedWith('Challenge response failed account balance check')
      })

      it('fail merkle proof', async () => {
        await initInflation.mint(
          await accounts[2].getAddress(),
          '150000000000000000000000000'
        )

        rootHashProposal = await getRootHash()
        await rootHashProposal
          .connect(accounts[0])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts)

        const requestedIndex = 2
        await rootHashProposal
          .connect(accounts[1])
          .challengeRootHashRequestAccount(
            await accounts[0].getAddress(),
            requestedIndex
          )

        const a = answer(tree, 2)
        await expect(
          rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[1].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance.add(BigNumber.from('150000000000000000000000000')),
              a[0].sum,
              requestedIndex
            )
        ).to.be.revertedWith(
          'Challenge response failed merkle tree verification check'
        )
      })

      it('fail running sum first index', async () => {
        tree = getTree(map, [0, 100])
        proposedRootHash = tree.hash
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts)
        const requestedIndex = 0
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(
            await accounts[1].getAddress(),
            requestedIndex
          )
        const a = answer(tree, 0)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        ).to.be.revertedWith('cumulative sum does not starts from 0')
      })

      it('fail running sum right index', async () => {
        map = new Map([
          [await accounts[0].getAddress(), await ecoBalance(accounts[0])],
          [await accounts[1].getAddress(), await ecoBalance(accounts[1])],
          [await accounts[2].getAddress(), await ecoBalance(accounts[2])],
          [await accounts[3].getAddress(), await ecoBalance(accounts[2])],
        ])
        rootHashProposal = await getRootHash()
        tree = getTree(map, [2, 300000])
        proposedRootHash = tree.hash
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts + 1)

        let requestedIndex = 2
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(
            await accounts[1].getAddress(),
            requestedIndex
          )
        let a = answer(tree, requestedIndex)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        ).to.emit(rootHashProposal, 'ChallengeSuccessResponse')

        requestedIndex = 1
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(
            await accounts[1].getAddress(),
            requestedIndex
          )
        a = answer(tree, requestedIndex)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        ).to.be.revertedWith('Right neighbor sum verification failed')
      })

      it('fail running sum left index', async () => {
        map = new Map([
          [await accounts[0].getAddress(), await ecoBalance(accounts[0])],
          [await accounts[1].getAddress(), await ecoBalance(accounts[1])],
          [await accounts[2].getAddress(), await ecoBalance(accounts[2])],
          [await accounts[3].getAddress(), await ecoBalance(accounts[2])],
        ])
        rootHashProposal = await getRootHash()
        tree = getTree(map, [2, 500])
        proposedRootHash = tree.hash
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts + 1)

        let requestedIndex = 1
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(
            await accounts[1].getAddress(),
            requestedIndex
          )
        let a = answer(tree, requestedIndex)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        ).to.emit(rootHashProposal, 'ChallengeSuccessResponse')

        requestedIndex = 2
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(
            await accounts[1].getAddress(),
            requestedIndex
          )
        a = answer(tree, requestedIndex)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        ).to.be.revertedWith('Left neighbor sum verification failed')
      })

      it('fail total sum, last index', async () => {
        map = new Map([
          [await accounts[0].getAddress(), await ecoBalance(accounts[0])],
          [await accounts[1].getAddress(), await ecoBalance(accounts[1])],
          [await accounts[2].getAddress(), await ecoBalance(accounts[2])],
        ])
        rootHashProposal = await getRootHash()
        tree = getTree(map, [2, 500])
        proposedRootHash = tree.hash
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts)

        const requestedIndex = 2
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(
            await accounts[1].getAddress(),
            requestedIndex
          )
        const a = answer(tree, requestedIndex)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        ).to.be.revertedWith('cumulative sum does not match total sum')
      })

      it('fail account order first index', async () => {
        rootHashProposal = await getRootHash()
        tree = getTree(map, [], [0, 2])
        proposedRootHash = tree.hash
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts)

        let requestedIndex = 1
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(
            await accounts[1].getAddress(),
            requestedIndex
          )
        let a = answer(tree, requestedIndex)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        ).to.emit(rootHashProposal, 'ChallengeSuccessResponse')

        requestedIndex = 0
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(
            await accounts[1].getAddress(),
            requestedIndex
          )
        a = answer(tree, requestedIndex)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        ).to.be.revertedWith('Right neighbor order verification failed')
      })

      it('fail account order middle index', async () => {
        tree = getTree(map, [], [0, 1])
        proposedRootHash = tree.hash
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts)

        let requestedIndex = 0
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(
            await accounts[1].getAddress(),
            requestedIndex
          )
        let a = answer(tree, 0)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        ).to.emit(rootHashProposal, 'ChallengeSuccessResponse')

        requestedIndex = 1
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(
            await accounts[1].getAddress(),
            requestedIndex
          )
        a = answer(tree, 1)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        ).to.be.revertedWith('Left neighbor order verification failed')
      })

      it('fail account order last index', async () => {
        tree = getTree(map, [], [0, 2])
        proposedRootHash = tree.hash
        await rootHashProposal
          .connect(accounts[1])
          .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts)

        let requestedIndex = 1
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(
            await accounts[1].getAddress(),
            requestedIndex
          )
        let a = answer(tree, requestedIndex)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        ).to.emit(rootHashProposal, 'ChallengeSuccessResponse')

        requestedIndex = 2
        await rootHashProposal
          .connect(accounts[2])
          .challengeRootHashRequestAccount(
            await accounts[1].getAddress(),
            requestedIndex
          )
        a = answer(tree, requestedIndex)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              requestedIndex
            )
        ).to.be.revertedWith('Left neighbor order verification failed')
      })
    })

    context('accept and reject root hash', () => {
      it('succeeds', async () => {
        await time.increase(86401)
        await expect(
          rootHashProposal.checkRootHashStatus(await accounts[0].getAddress())
        )
          .to.emit(rootHashProposal, 'RootHashAcceptance')
          .withArgs(await accounts[0].getAddress(), totalSum, amountOfAccounts)

        await rootHashProposal
          .connect(accounts[0])
          .claimFee(await accounts[0].getAddress())

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimFee(await accounts[0].getAddress())
        ).to.be.revertedWith(
          'challenger may claim fee on rejected proposal only'
        )

        await time.increase(86400000)
        await rootHashProposal.destruct()
      })

      it('success rejects alternative proposed hashes', async () => {
        await time.increase(86401)
        await expect(
          rootHashProposal.checkRootHashStatus(await accounts[0].getAddress())
        )
          .to.emit(rootHashProposal, 'RootHashAcceptance')
          .withArgs(await accounts[0].getAddress(), totalSum, amountOfAccounts)

        await rootHashProposal
          .connect(accounts[0])
          .claimFee(await accounts[0].getAddress())

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimFee(await accounts[0].getAddress())
        ).to.be.revertedWith(
          'challenger may claim fee on rejected proposal only'
        )

        await time.increase(86400000)
        await rootHashProposal.destruct()
      })

      it('cannot destruct before fee collection period ends', async () => {
        await time.increase(86401)
        await rootHashProposal.checkRootHashStatus(
          await accounts[0].getAddress()
        )
        await expect(rootHashProposal.destruct()).to.be.revertedWith(
          'contract might be destructed after fee collection period is over'
        )
      })

      // TODO: claim Fee for rejector

      it('no external function run once hash been accepted', async () => {
        await time.increase(86401)
        await expect(
          rootHashProposal.checkRootHashStatus(await accounts[0].getAddress())
        ).to.emit(rootHashProposal, 'RootHashAcceptance')

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts)
        ).to.be.revertedWith('The root hash accepted, no more actions allowed')

        await expect(
          rootHashProposal
            .connect(accounts[2])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), 0)
        ).to.be.revertedWith('The root hash accepted, no more actions allowed')

        const a = answer(tree, 0)
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              0
            )
        ).to.be.revertedWith('The root hash accepted, no more actions allowed')

        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              0,
              await accounts[0].getAddress()
            )
        ).to.be.revertedWith('The root hash accepted, no more actions allowed')
      })
    })

    context('incorrect claimMissingAccount', () => {
      it('cannot claim a fake account', async () => {
        const requestedIndex = 2
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex,
              await accounts[9].getAddress()
            )
        ).to.be.revertedWith('Missing account does not exist')
      })

      it('must challenge before a claim', async () => {
        const requestedIndex = 2
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex,
              await accounts[2].getAddress()
            )
        ).to.be.revertedWith('Submit Index Request first')
      })

      it('must challenge left side to claim', async () => {
        const requestedIndex = 2
        expect(await verifyOnChain(tree, 0, accounts[0]))
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex,
              await accounts[2].getAddress()
            )
        ).to.be.revertedWith('Left _index is not resolved')
      })

      it('must challenge right side to claim', async () => {
        const requestedIndex = 0
        expect(await verifyOnChain(tree, 2, accounts[0]))
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex,
              await accounts[2].getAddress()
            )
        ).to.be.revertedWith('Right _index is not resolved')
      })

      it('left side must be less to claim', async () => {
        const requestedIndex = 2
        expect(await verifyOnChain(tree, 1, accounts[0]))
        expect(await verifyOnChain(tree, 2, accounts[0]))
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex,
              tree.left.left.account
            )
        ).to.be.revertedWith('Missing account claim failed')
      })

      it('right side must be greater to claim', async () => {
        const requestedIndex = 1
        expect(await verifyOnChain(tree, 0, accounts[0]))
        expect(await verifyOnChain(tree, 1, accounts[0]))
        await expect(
          rootHashProposal
            .connect(accounts[1])
            .claimMissingAccount(
              await accounts[0].getAddress(),
              requestedIndex,
              tree.right.left.account
            )
        ).to.be.revertedWith('Missing account claim failed')
      })
    })

    context(
      'white box testing of state variables for accepting/rejecting root hashes',
      () => {
        async function getTime(tx) {
          const blockHash = tx.blockHash
          const block = await ethers.provider.getBlock(blockHash)
          return block.timestamp
        }

        it('lastLiveChallenge correct calculation', async () => {
          let rhp = await rootHashProposal.rootHashProposals(
            await accounts[0].getAddress()
          )
          expect(rhp.lastLiveChallenge).to.equal(0)
          const firstIndex = 0
          let tx = await rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(
              await accounts[0].getAddress(),
              firstIndex
            )
          let t = await getTime(tx)
          rhp = await rootHashProposal.rootHashProposals(
            await accounts[0].getAddress()
          )
          expect(rhp.lastLiveChallenge).to.equal(t + 3600 * 25)

          /* another challenger comes in, last live challenge gets updated */

          const secondIndex = 1
          await time.increase(3600 * 10)
          tx = await rootHashProposal
            .connect(accounts[2])
            .challengeRootHashRequestAccount(
              await accounts[0].getAddress(),
              secondIndex
            )
          t = await getTime(tx)
          rhp = await rootHashProposal.rootHashProposals(
            await accounts[0].getAddress()
          )
          expect(rhp.lastLiveChallenge).to.equal(t + 3600 * 25)

          /* time passes, first challenger comes back, lastLiveChallenge remain the same. */

          const thirdIndex = 2
          await time.increase(3600 * 10)
          await rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(
              await accounts[0].getAddress(),
              thirdIndex
            )
          rhp = await rootHashProposal.rootHashProposals(
            await accounts[0].getAddress()
          )
          expect(rhp.lastLiveChallenge).to.equal(t + 3600 * 25)

          // second challenger gets responded to, lastLiveChallenge is increased
          const a = answer(tree, secondIndex)
          rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              secondIndex
            )
          rhp = await rootHashProposal.rootHashProposals(
            await accounts[0].getAddress()
          )
          expect(rhp.lastLiveChallenge).to.equal(t + 3600 * 26)
        })

        it('doesnt allow a challenge past the time limit', async () => {
          let rhp = await rootHashProposal.rootHashProposals(
            await accounts[0].getAddress()
          )
          expect(rhp.amountPendingChallenges).to.equal(0)

          await rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), 0)

          rhp = await rootHashProposal.rootHashProposals(
            await accounts[0].getAddress()
          )
          expect(rhp.amountPendingChallenges).to.equal(1)

          const a = answer(tree, 0)
          await time.increase(86400000)
          await expect(
            rootHashProposal
              .connect(accounts[0])
              .respondToChallenge(
                await accounts[1].getAddress(),
                a[1].reverse(),
                a[0].account,
                a[0].balance,
                a[0].sum,
                0
              )
          ).to.be.revertedWith('Timeframe to respond to a challenge is over')
        })

        it('amountPendingChallenges correct calculation', async () => {
          let rhp = await rootHashProposal.rootHashProposals(
            await accounts[0].getAddress()
          )
          expect(rhp.amountPendingChallenges).to.equal(0)

          await rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), 0)

          rhp = await rootHashProposal.rootHashProposals(
            await accounts[0].getAddress()
          )
          expect(rhp.amountPendingChallenges).to.equal(1)

          let a = answer(tree, 0)
          await rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[1].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              0
            )

          rhp = await rootHashProposal.rootHashProposals(
            await accounts[0].getAddress()
          )
          expect(rhp.amountPendingChallenges).to.equal(0)

          await rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), 1)
          await rootHashProposal
            .connect(accounts[2])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), 2)

          rhp = await rootHashProposal.rootHashProposals(
            await accounts[0].getAddress()
          )
          expect(rhp.amountPendingChallenges).to.equal(2)

          a = answer(tree, 1)
          await rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[1].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              1
            )

          rhp = await rootHashProposal.rootHashProposals(
            await accounts[0].getAddress()
          )
          expect(rhp.amountPendingChallenges).to.equal(1)

          a = answer(tree, 2)
          await rootHashProposal
            .connect(accounts[0])
            .respondToChallenge(
              await accounts[2].getAddress(),
              a[1].reverse(),
              a[0].account,
              a[0].balance,
              a[0].sum,
              2
            )

          rhp = await rootHashProposal.rootHashProposals(
            await accounts[0].getAddress()
          )
          expect(rhp.amountPendingChallenges).to.equal(0)
        })

        it('newChallengerSubmissionEnds correct calculation', async () => {
          await time.increase(3600 * 10)
          await rootHashProposal
            .connect(accounts[1])
            .proposeRootHash(
              BigNumber.from(proposedRootHash).add(1).toHexString(),
              totalSum,
              amountOfAccounts
            )
          await rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), 0)
          await time.increase(3600 * 15)
          expect(
            rootHashProposal
              .connect(accounts[2])
              .challengeRootHashRequestAccount(
                await accounts[0].getAddress(),
                1
              )
          ).to.be.revertedWith('Time to submit new challenges is over')
          await rootHashProposal
            .connect(accounts[1])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), 1)
          await rootHashProposal
            .connect(accounts[2])
            .challengeRootHashRequestAccount(await accounts[1].getAddress(), 0)
        })

        it('requestPerChallenge correct calculation', async () => {
          function getBaseLog(x, y) {
            return Math.log(y) / Math.log(x)
          }
          const amountOfRequests = [16, 23, 1000, 1000000]
          let allowedAmountOfRequests

          for (let i = 0; i < 8; i += 1) {
            await initInflation.mint(
              await accounts[i].getAddress(),
              '10000000000000000000000000000000000000'
            )
            eco
              .connect(accounts[i])
              .approve(
                rootHashProposal.address,
                await eco.balanceOf(await accounts[i].getAddress())
              )
          }

          for (let i = 0; i < 4; i += 1) {
            await rootHashProposal.connect(accounts[i + 1]).proposeRootHash(
              BigNumber.from(proposedRootHash)
                .add(BigNumber.from(1 + i))
                .toHexString(),
              totalSum,
              amountOfRequests[i]
            )
            allowedAmountOfRequests =
              2 * Math.ceil(getBaseLog(2, amountOfRequests[i])) + 2
            for (let j = 0; j < allowedAmountOfRequests; j += 1) {
              await rootHashProposal
                .connect(accounts[i + 2])
                .challengeRootHashRequestAccount(
                  await accounts[i + 1].getAddress(),
                  j
                )
            }
            expect(
              rootHashProposal
                .connect(accounts[i + 2])
                .challengeRootHashRequestAccount(
                  await accounts[i + 1].getAddress(),
                  allowedAmountOfRequests
                )
            ).to.be.revertedWith(
              'Challenger reached maximum amount of allowed challenges'
            )
          }
        })

        it('challengeEnds correct calculation', async () => {
          // 2 challenges in 2 different hours
          for (let i = 0; i < 2; i += 1) {
            await rootHashProposal
              .connect(accounts[2])
              .challengeRootHashRequestAccount(
                await accounts[0].getAddress(),
                i
              )
            await time.increase(3600)
          }

          // increase to hour 25
          await time.increase(3600 * 23)

          // respond to each initial challenges
          // each is an additional hour time increase
          for (let i = 0; i < 2; i += 1) {
            const a = answer(tree, i)
            await rootHashProposal
              .connect(accounts[0])
              .respondToChallenge(
                await accounts[2].getAddress(),
                a[1].reverse(),
                a[0].account,
                a[0].balance,
                a[0].sum,
                i
              )
            await time.increase(3600)
          }

          // increase to hour 28 - 1 min, 2 challenges and 2 responses (4 hours added), currently still in window
          await time.increase(3540)

          // successfully challenge again
          await rootHashProposal
            .connect(accounts[2])
            .challengeRootHashRequestAccount(await accounts[0].getAddress(), 2)

          // 5 total actions, increase to hour 29, just out of window with 24 + 5
          // removing the extra minute causes the next challenge
          // to revert with 'Index already challenged' instead
          await time.increase(3600 + 60)

          await expect(
            rootHashProposal
              .connect(accounts[2])
              .challengeRootHashRequestAccount(
                await accounts[0].getAddress(),
                2
              )
          ).to.be.revertedWith('Time to submit additional challenges is over')
        })
      }
    )
  })

  context('random tests', () => {
    it('is complex', async () => {
      const list = []
      let totalSum = BigNumber.from('0')
      const amountOfAccounts = 10
      let tmp = BigNumber.from('0')
      for (let i = 1; i <= amountOfAccounts; i += 1) {
        tmp = BigNumber.from('10000000000000000000000000').mul(i)
        list.push([await accounts[i - 1].getAddress(), tmp])
        await initInflation.mint(await accounts[i - 1].getAddress(), tmp)
        totalSum = totalSum.add(tmp)
      }
      rootHashProposal = await getRootHash()

      for (let i = 0; i < amountOfAccounts; i += 1) {
        eco
          .connect(accounts[1])
          .approve(
            rootHashProposal.address,
            await eco.balanceOf(await accounts[i].getAddress())
          )
      }

      const bigMap = new Map(list)
      const cheatMap = new Map(bigMap)
      cheatMap.set(
        await accounts[4].getAddress(),
        BigNumber.from('100000000000000000000000000')
      )
      cheatMap.set(
        await accounts[5].getAddress(),
        BigNumber.from('10000000000000000000000000')
      )

      const bigt = getTree(bigMap)
      const ct = getTree(cheatMap)

      const proposedRootHash = ct.hash
      await rootHashProposal
        .connect(accounts[0])
        .proposeRootHash(proposedRootHash, totalSum, amountOfAccounts)
      expect(await verifyOnChain(ct, 9, accounts[0]))
      const { result, index } = await interrogateOnChain(
        bigt,
        ct,
        await accounts[0].getAddress()
      )
      expect(result === false && (index === 4 || index === 5))
    })

    for (let k = 0; k <= 40; k += 1) {
      const action = getRandomIntInclusive(0, 3)
      let tmp
      it(`random test ${k}, action ${action}`, async () => {
        let amountOfAccounts = getRandomIntInclusive(4, 10)
        let totalSum = BigNumber.from('0')
        const list = []
        for (let i = 0; i < amountOfAccounts; i += 1) {
          tmp = BigNumber.from('10000000000000000000000000').mul(
            getRandomIntInclusive(1, 10000)
          )
          list.push([await accounts[2 * i].getAddress(), tmp])
          await initInflation.mint(await accounts[2 * i].getAddress(), tmp)
          totalSum = totalSum.add(tmp)
        }

        rootHashProposal = await getRootHash()
        for (let i = 0; i < amountOfAccounts; i += 1) {
          eco
            .connect(accounts[i])
            .approve(
              rootHashProposal.address,
              await eco.balanceOf(await accounts[i].getAddress())
            )
        }
        const goodMap = new Map(list)
        const goodTree = getTree(goodMap)
        const badmap = new Map(goodMap)
        if (action === 0) {
          /* Add something */
          amountOfAccounts += 1
          tmp = BigNumber.from('10000000000000000000000000').mul(
            getRandomIntInclusive(1, 10000)
          )
          totalSum = totalSum.add(tmp)

          badmap.set(
            await accounts[
              getRandomIntInclusiveOdd(0, 2 * amountOfAccounts - 1)
            ].getAddress(),
            tmp
          )
        } else if (action === 1) {
          /* Remove something */
          amountOfAccounts -= 1
          badmap.delete(
            await accounts[
              getRandomIntInclusiveEven(0, 2 * amountOfAccounts - 1)
            ].getAddress()
          )
        } else if (action === 2) {
          /* Change a balance */
          const acc =
            accounts[getRandomIntInclusiveEven(0, 2 * amountOfAccounts - 1)]
          tmp = BigNumber.from('10000000000000000000000000').mul(
            getRandomIntInclusive(1, 10000)
          )
          totalSum = totalSum.add(tmp)
          badmap.set(await acc.getAddress(), tmp)
        } else if (action === 3) {
          /* swap adjacent balances */
          if (amountOfAccounts <= 2) {
            // to avoid weird range in random acc gen
            amountOfAccounts += 4
          }
          const accIndex = getRandomIntInclusiveEven(
            0,
            2 * amountOfAccounts - 4
          )
          const first = badmap.get(await accounts[accIndex].getAddress())
          const second = badmap.get(await accounts[accIndex + 2].getAddress())
          badmap.set(await accounts[accIndex].getAddress(), second)
          badmap.set(await accounts[accIndex + 2].getAddress(), first)
        }

        const badTree = getTree(badmap)

        expect(goodMap).to.not.deep.equal(badmap)

        await rootHashProposal
          .connect(accounts[0])
          .proposeRootHash(badTree.hash, totalSum, amountOfAccounts)

        const [res, tests] = await interrogateOnChain(
          goodTree,
          badTree,
          accounts[0]
        )

        expect(res).to.be.false
        expect(
          tests,
          `Needed ${tests}, expected ${Math.ceil(Math.log2(amountOfAccounts))}`
        ).to.be.lessThanOrEqual(Math.ceil(Math.log2(amountOfAccounts)))
      })
    }
  })
})
