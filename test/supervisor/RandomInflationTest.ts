/* eslint-disable no-unused-vars */
import { ethers } from 'hardhat'
import { BigNumber } from 'ethers'
import { expect } from 'chai'
import { Policy, TimedPolicies } from '../../typechain-types'
import { Supervisor } from '../../supervisor/supervisor_master'
import { InflationGovernor } from '../../supervisor/supervisor_randomInflation'

const time = require('../utils/time.ts')

const { ecoFixture } = require('../utils/fixtures')

describe('RandomInflation [@group=13]', () => {
  let alice
  let bob
  let charlie
  let policy: Policy
  let timedPolicies: TimedPolicies
  let supervisor: Supervisor
  let inflationGovernor!: InflationGovernor

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie] = accounts
    ;({ policy, timedPolicies } = await ecoFixture())

    supervisor = new Supervisor()
    await supervisor.startSupervisor('', policy, alice)
    inflationGovernor = supervisor.inflationGovernor
  })

  it('fetches new randomInflation stuff on newInflation', async () => {})
})
