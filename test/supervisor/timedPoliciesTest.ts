/* eslint-disable no-unused-vars */
import { ethers } from 'hardhat'
import { Policy, TimedPolicies } from '../../typechain-types'
import { Supervisor } from '../../supervisor/supervisor_master'
import { expect } from 'chai'
import { TimeGovernor } from '../../supervisor/supervisor_timedPolicies'

const time = require('../utils/time.ts')

const { ecoFixture } = require('../utils/fixtures')

describe('TimedPolicies [@group=13]', () => {
  let alice
  let policy: Policy
  let timedPolicies: TimedPolicies

  let supervisor: Supervisor
  let timeGovernor: TimeGovernor

  before(async () => {
    const accounts = await ethers.getSigners()
    ;[alice] = accounts
    ;({ policy, timedPolicies } = await ecoFixture())

    supervisor = new Supervisor()
    await supervisor.startSupervisor('', policy, alice)
    timeGovernor = supervisor.timeGovernor
  })

  it('increments generation and updates supervisor values', async () => {
    const startGen: number = (await timedPolicies.generation()).toNumber()
    const nextGenStart: number = timeGovernor.nextGenStart
    const timeToNextGeneration: number =
      nextGenStart - (await time.latestBlockTimestamp())

    await time.increase(timeToNextGeneration + 1)
    await time.waitBlockTime()

    expect((await timedPolicies.generation()).toNumber()).to.equal(startGen + 1)

    expect(timeGovernor.nextGenStart).to.be.gt(nextGenStart)
  })
})
