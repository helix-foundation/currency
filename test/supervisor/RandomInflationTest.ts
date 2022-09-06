import { ethers, expect } from 'hardhat'
import { Policy, TimedPolicies } from '../../typechain-types'
import { testStartSupervisor } from '../../supervisor/supervisor_master'

const time = require('../utils/time.ts')

const { ecoFixture } = require('../utils/fixtures')

describe('RandomInflation [@group=13]', () => {
  let alice
  let policy: Policy
  let timedPolicies: TimedPolicies

  before(async () => {
    const accounts = await ethers.getSigners()
    ;[alice] = accounts
    ;({ policy, timedPolicies } = await ecoFixture())

    await testStartSupervisor(policy, alice)
  })
})