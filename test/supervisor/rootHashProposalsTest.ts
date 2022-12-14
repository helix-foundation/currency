/* eslint-disable no-unused-vars */
import { ethers } from 'hardhat'
import { expect } from 'chai'
import {
  Policy,
  CurrencyGovernance,
  ECO,
  contracts,
} from '../../typechain-types'
import { Supervisor } from '../../supervisor/supervisor'
import { InflationGovernor } from '../../supervisor/inflationGovernor'
import { CurrencyGovernor } from '../../supervisor/currencyGovernor'
import { BigNumber, Signer } from 'ethers'
import { TimeGovernor } from '../../supervisor/timeGovernor'

import { ecoFixture } from '../utils/fixtures'
import time from '../utils/time'

const {
  getCommit,
  getFormattedBallot,
} = require('../../tools/test/currencyGovernanceVote')

describe('RandomInflation [@group=13]', () => {
  let alice: Signer
  let bob: Signer
  let charlie: Signer
  let dave: Signer
  let eco: ECO
  let initInflation
  let policy: Policy
  let supervisor: Supervisor
  let timeGovernor: TimeGovernor
  let currencyGovernor: CurrencyGovernor
  let inflationGovernor!: InflationGovernor
  let map: [string, BigNumber][]

  const hash = (x: any) =>
    ethers.utils.solidityKeccak256(
      ['bytes32', 'address', 'address[]'],
      [x[0], x[1], x[2]]
    )
  const inflationVote = 10
  const rewardVote = 20000

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie, dave] = accounts
    const trustees = [
      await bob.getAddress(),
      await charlie.getAddress(),
      await dave.getAddress(),
    ]

    ;({ policy, eco, faucet: initInflation } = await ecoFixture(trustees))

    map = [
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
    ]

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

    supervisor = new Supervisor()
    await supervisor.startTestSupervisor(policy, alice)
    timeGovernor = supervisor.timeGovernor
    currencyGovernor = supervisor.currencyGovernor
    inflationGovernor = supervisor.inflationGovernor

    await time.advanceBlock()
    await time.waitBlockTime()
    await time.increase(3600 * 24 * 14.1)
    await time.waitBlockTime()

    const governance: CurrencyGovernance = await ethers.getContractAt(
      'CurrencyGovernance',
      currencyGovernor.currencyGovernance.address
    )
    await governance
      .connect(bob)
      .propose(inflationVote, rewardVote, 0, 0, '1000000000000000000', '')

    await time.increase(3600 * 24 * 10)

    const bobvote: any = [
      ethers.utils.randomBytes(32),
      await bob.getAddress(),
      [await bob.getAddress()],
    ]
    await governance.connect(bob).commit(getCommit(...bobvote))
    const charlievote: any = [
      ethers.utils.randomBytes(32),
      await charlie.getAddress(),
      [await bob.getAddress()],
    ]
    await governance.connect(charlie).commit(getCommit(...charlievote))
    const davevote: any = [
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
  })

  afterEach(async () => {
    await supervisor.killAllListeners()
  })

  it('submits a root hash proposal', async () => {
    await time.increase(3600 * 24 * 1)
    await time.waitBlockTime(25000)

    expect(
      (
        await inflationGovernor.inflationRootHashProposal.rootHashProposals(
          await alice.getAddress()
        )
      ).initialized
    ).to.be.true
  })

  it('responds to a challenge', async () => {
    await time.increase(3600 * 24 * 1)
    await time.waitBlockTime(15000)

    // check that rhp is proposed
    expect(
      (
        await inflationGovernor.inflationRootHashProposal.rootHashProposals(
          await alice.getAddress()
        )
      ).initialized
    ).to.be.true

    await eco
      .connect(bob)
      .approve(
        inflationGovernor.inflationRootHashProposal.address,
        await inflationGovernor.inflationRootHashProposal.CHALLENGE_FEE()
      )

    await inflationGovernor.inflationRootHashProposal
      .connect(bob)
      .challengeRootHashRequestAccount(await alice.getAddress(), 1)

    // check that challenge is lodged
    expect(
      (
        await (
          await inflationGovernor.inflationRootHashProposal.rootHashProposals(
            await alice.getAddress()
          )
        ).amountPendingChallenges
      ).toNumber()
    ).to.eq(1)

    await time.advanceBlock()
    await time.waitBlockTime(15000)

    // check that challenge has been responded to
    expect(
      (
        await (
          await inflationGovernor.inflationRootHashProposal.rootHashProposals(
            await alice.getAddress()
          )
        ).amountPendingChallenges
      ).toNumber()
    ).to.eq(0)
  })

  it('responds to multiple challenges', async () => {
    await time.increase(3600 * 24 * 1)
    await time.waitBlockTime(15000)

    // check that rhp is proposed
    expect(
      (
        await inflationGovernor.inflationRootHashProposal.rootHashProposals(
          await alice.getAddress()
        )
      ).initialized
    ).to.be.true

    let tx = await eco
      .connect(bob)
      .approve(
        inflationGovernor.inflationRootHashProposal.address,
        await inflationGovernor.inflationRootHashProposal.CHALLENGE_FEE()
      )
    let rc = await tx.wait()

    tx = await inflationGovernor.inflationRootHashProposal
      .connect(bob)
      .challengeRootHashRequestAccount(await alice.getAddress(), 1)
    rc = await tx.wait()

    tx = await eco
      .connect(charlie)
      .approve(
        inflationGovernor.inflationRootHashProposal.address,
        await inflationGovernor.inflationRootHashProposal.CHALLENGE_FEE()
      )
    rc = await tx.wait()

    await inflationGovernor.inflationRootHashProposal
      .connect(charlie)
      .challengeRootHashRequestAccount(await alice.getAddress(), 2)

    await time.waitBlockTime(15000)

    // check that challenges have been responded to
    expect(
      (
        await (
          await inflationGovernor.inflationRootHashProposal.rootHashProposals(
            await alice.getAddress()
          )
        ).amountPendingChallenges
      ).toNumber()
    ).to.eq(0)
  })

  it('sets timestamps + happy path acceptance', async () => {
    await time.increase(3600 * 24 * 1)
    await time.waitBlockTime(10000)

    const rhp =
      await inflationGovernor.inflationRootHashProposal.rootHashProposals(
        await inflationGovernor.wallet.getAddress()
      )

    expect(inflationGovernor.lastLiveChallenge).to.eq(
      rhp.lastLiveChallenge.toNumber()
    )
    expect(inflationGovernor.newChallengerSubmissionEnds).to.eq(
      rhp.newChallengerSubmissionEnds.toNumber()
    )
    expect(
      inflationGovernor.newChallengerSubmissionEnds >
        inflationGovernor.lastLiveChallenge
    )

    await time.setNextBlockTimestamp(
      inflationGovernor.newChallengerSubmissionEnds + 1
    )
    await time.advanceBlock()
    await time.waitBlockTime()

    expect(
      await inflationGovernor.inflationRootHashProposal.acceptedRootHash()
    ).to.not.eq(ethers.constants.HashZero)
  })

  it('updates values upon challenge + accepts root hash at the right time', async () => {
    await time.increase(3600 * 24 * 1)
    await time.waitBlockTime()

    const rhp =
      await inflationGovernor.inflationRootHashProposal.rootHashProposals(
        await inflationGovernor.wallet.getAddress()
      )
    const initialLastLiveChallenge: number = inflationGovernor.lastLiveChallenge
    console.log(initialLastLiveChallenge)

    let tx = await eco
      .connect(bob)
      .approve(
        inflationGovernor.inflationRootHashProposal.address,
        await inflationGovernor.inflationRootHashProposal.CHALLENGE_FEE()
      )
    let rc = await tx.wait()
    tx = await inflationGovernor.inflationRootHashProposal
      .connect(bob)
      .challengeRootHashRequestAccount(await alice.getAddress(), 1)
    rc = await tx.wait()
    await time.waitBlockTime()

    expect(inflationGovernor.lastLiveChallenge > initialLastLiveChallenge)
    expect(
      inflationGovernor.newChallengerSubmissionEnds <
        inflationGovernor.lastLiveChallenge
    )

    await time.setNextBlockTimestamp(inflationGovernor.lastLiveChallenge + 1)
    await time.advanceBlock()
    await time.waitBlockTime(5000)

    expect(
      await inflationGovernor.inflationRootHashProposal.acceptedRootHash()
    ).to.not.eq(ethers.constants.HashZero)
  })
})
