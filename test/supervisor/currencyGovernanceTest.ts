import { ethers, expect } from 'hardhat'
import {
  Policy,
  TimedPolicies,
  CurrencyGovernance,
} from '../../typechain-types'
import { testStartSupervisor } from '../../supervisor/supervisor_master'

const time = require('../utils/time.ts')

const { ecoFixture } = require('../utils/fixtures')

describe('currencyGovernance_supervisor [@group=4]', () => {
  let alice
  let policy: Policy
  let timedPolicies: TimedPolicies
  let currencyGovernance: CurrencyGovernance

  before(async () => {
    const accounts = await ethers.getSigners()
    ;[alice] = accounts
    ;({ policy, timedPolicies, currencyGovernance } = await ecoFixture())

    await testStartSupervisor(policy, alice)
  })
  it('updates stages correctly', async () => {
    // test
  })
  it('computes correctly', async () => {
    // test
  })
  it('updates currencyGovernance properly upon generation increment', async () => {
    // test
  })
})
