/* eslint-disable no-unused-vars */
import { ethers } from 'hardhat'
import { EcoFaucet, Policy, TimedPolicies } from '../../typechain-types'
import { Supervisor } from '../../supervisor/supervisor'
import { expect } from 'chai'
import { TimeGovernor } from '../../supervisor/timeGovernor'
import { BigNumber, Signer } from 'ethers'

const time = require('../utils/time.ts')

const { ecoFixture } = require('../utils/fixtures')

describe('TimedPolicies [@group=13]', () => {
  let alice: Signer
  let bob: Signer
  let policy: Policy
  let timedPolicies: TimedPolicies
  let faucet: EcoFaucet

  let supervisor: Supervisor
  let timeGovernor: TimeGovernor

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob] = accounts
    const trustees = [await alice.getAddress(), await bob.getAddress()]
    ;({ policy, timedPolicies, faucet } = await ecoFixture(trustees))

    supervisor = new Supervisor()
    await supervisor.startSupervisor('', policy, alice)
    timeGovernor = supervisor.timeGovernor
  })

  afterEach(async () => {
    await supervisor.killAllListeners()
  })

  it('increments generation and updates supervisor values', async () => {
    const startGen: number = (await timedPolicies.generation()).toNumber()
    const nextGenStart: number = timeGovernor.nextGenStart
    const timeToNextGeneration: number =
      nextGenStart - (await time.latestBlockTimestamp())

    await time.increase(timeToNextGeneration + 1)
    await time.waitBlockTime(20000)

    expect((await timedPolicies.generation()).toNumber()).to.equal(startGen + 1)

    expect(timeGovernor.nextGenStart).to.be.gt(nextGenStart)
  })

  it('calls annualUpdate and updates supervisor values', async () => {
    const rewardValue: BigNumber = await timeGovernor.trustedNodes.voteReward()
    const rewardsCount: number = (
      await timeGovernor.trustedNodes.unallocatedRewardsCount()
    ).toNumber()
    const initialYearEnd: number = await timeGovernor.yearEnd
    await faucet.mintx(
      timeGovernor.trustedNodes.address,
      rewardValue.mul(rewardsCount)
    )
    const generationTime: number = (
      await timeGovernor.timedPolicy.MIN_GENERATION_DURATION()
    ).toNumber()
    const generationsPerYear: number = (
      await timeGovernor.trustedNodes.GENERATIONS_PER_YEAR()
    ).toNumber()
    await time.increase(generationsPerYear * generationTime)
    await time.waitBlockTime()

    const newYearEnd: number = timeGovernor.yearEnd
    expect(newYearEnd).to.be.gt(initialYearEnd)
  })
})
