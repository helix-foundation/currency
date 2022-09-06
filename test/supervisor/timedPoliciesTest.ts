/* eslint-disable no-unused-vars */
import { ethers, expect } from 'hardhat'
import { Policy, TimedPolicies } from '../../typechain-types'
import { Supervisor } from '../../supervisor/supervisor_master'

const time = require('../utils/time.ts')

const { ecoFixture } = require('../utils/fixtures')

describe('timedPolicies_Supervisor [@group=4]', () => {
  let alice
  let policy: Policy
  let timedPolicies: TimedPolicies
  let supervisor: Supervisor

  before(async () => {
    const accounts = await ethers.getSigners()
    ;[alice] = accounts
    ;({ policy, timedPolicies } = await ecoFixture())

    supervisor = new Supervisor()
    await supervisor.testStartSupervisor(policy, alice)
  })

  it('increments generation at appropriate times', async () => {
    const startGen: number = (await timedPolicies.generation()).toNumber()
    let nextGenStart: number = (
      await timedPolicies.nextGenerationStart()
    ).toNumber()
    const timeToNextGeneration: number =
      nextGenStart - Math.floor(Date.now() / 1000)

    await time.increase(timeToNextGeneration - 105)
    let result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 5000)
    })
    expect((await timedPolicies.generation()).toNumber()).to.equal(startGen)

    await time.increase(95)
    result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 5000)
    })
    expect((await timedPolicies.generation()).toNumber()).to.equal(startGen + 1)

    nextGenStart = (await timedPolicies.nextGenerationStart()).toNumber()
    await time.increase(nextGenStart)
    result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 5000)
    })
    expect((await timedPolicies.generation()).toNumber()).to.equal(startGen + 2)
  })
})
