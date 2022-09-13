/* eslint-disable no-unused-vars */
import { ethers } from 'hardhat'
import { expect } from 'chai'
import {
  Policy,
  TimedPolicies,
  CurrencyGovernance,
  ECO,
} from '../../typechain-types'
import { Supervisor } from '../../supervisor/supervisor_master'
import { InflationGovernor } from '../../supervisor/supervisor_randomInflation'
import { CurrencyGovernor } from '../../supervisor/supervisor_currencyGovernance'
import { BigNumber, Signer } from 'ethers'
import { TimeGovernor } from '../../supervisor/supervisor_timedPolicies'
const time = require('../utils/time.ts')

const { ecoFixture } = require('../utils/fixtures')

describe('RandomInflation [@group=13]', () => {
  let alice: Signer
  let bob: Signer
  let charlie: Signer
  let dave: Signer
  let eco: ECO
  let initInflation
  let currencyTimer
  let rootHashProposal
  let inflation
  let policy: Policy
  let timedPolicies: TimedPolicies
  let supervisor: Supervisor
  let timeGovernor: TimeGovernor
  let currencyGovernor: CurrencyGovernor
  let inflationGovernor!: InflationGovernor
  let map: [string, BigNumber][]
  let tree: any

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

    ;({
      policy,
      eco,
      faucet: initInflation,
      timedPolicies,
      currencyTimer,
      rootHashProposal,
      inflation,
    } = await ecoFixture(trustees))

    if (timeGovernor) {
      console.log('kill time listener')
      await timeGovernor.killListener()
    }
    if (inflationGovernor) {
      console.log('killing inflation listeners')
      await inflationGovernor.killListeners()
    }

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
    await supervisor.startSupervisor('', policy, alice)
    timeGovernor = supervisor.timeGovernor
    currencyGovernor = supervisor.currencyGovernor
    inflationGovernor = supervisor.inflationGovernor

    await time.advanceBlock()
    let result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 10000)
    })
    await time.increase(3600 * 24 * 14.1)
    result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 10000)
    })

    const governance: CurrencyGovernance = await ethers.getContractAt(
      'CurrencyGovernance',
      currencyGovernor.currencyGovernance.address
    )
    await governance
      .connect(bob)
      .propose(inflationVote, rewardVote, 0, 0, '1000000000000000000', '')

    await time.increase(3600 * 24 * 10)
    // let result = await new Promise<void>((resolve, reject) => {
    //   setTimeout(() => resolve(), 10000)
    // })
    const bobvote: any = [
      ethers.utils.randomBytes(32),
      await bob.getAddress(),
      [await bob.getAddress()],
    ]
    await governance.connect(bob).commit(hash(bobvote))
    const charlievote: any = [
      ethers.utils.randomBytes(32),
      await charlie.getAddress(),
      [await bob.getAddress()],
    ]
    await governance.connect(charlie).commit(hash(charlievote))
    const davevote: any = [
      ethers.utils.randomBytes(32),
      await dave.getAddress(),
      [await bob.getAddress()],
    ]
    await governance.connect(dave).commit(hash(davevote))
    await time.increase(3600 * 24 * 3)
    result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 10000)
    })
    await governance.connect(bob).reveal(bobvote[0], bobvote[2])
    await governance.connect(charlie).reveal(charlievote[0], charlievote[2])
    await governance.connect(dave).reveal(davevote[0], davevote[2])
  })

  it('submits a root hash proposal', async () => {
    await time.increase(3600 * 24 * 1)
    // console.log(await inflationGovernor.inflationRootHashProposal.rootHashProposals(await alice.getAddress()))
    // expect(inflationGovernor.inflationRootHashProposal.)
    const result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 15000)
    })
    expect(
      (
        await inflationGovernor.inflationRootHashProposal.rootHashProposals(
          await alice.getAddress()
        )
      ).initialized
    ).to.be.true
  })

  it('responds to challenges', async () => {
    await time.increase(3600 * 24 * 1)
    // why is this map returning sums also?
    console.log(map)
    let result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 15000)
    })

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

    result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 10000)
    })

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

    // await inflationGovernor.inflationRootHashProposal.connect(bob).challengeRootHashRequestAccount(await alice.getAddress(), 1)
  })

  it('responds to multiple challenges', async () => {
    await time.increase(3600 * 24 * 1)
    // why is this map returning sums also?
    console.log(map)
    let result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 10000)
    })

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

    await eco
      .connect(bob)
      .approve(
        inflationGovernor.inflationRootHashProposal.address,
        await inflationGovernor.inflationRootHashProposal.CHALLENGE_FEE()
      )

    await inflationGovernor.inflationRootHashProposal
      .connect(bob)
      .challengeRootHashRequestAccount(await alice.getAddress(), 2)

    result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 15000)
    })

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
})
