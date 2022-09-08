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
  let policy: Policy
  let timedPolicies: TimedPolicies
  let supervisor: Supervisor
  let inflationGovernor!: InflationGovernor

  before(async () => {
    const accounts = await ethers.getSigners()
    ;[alice] = accounts
    ;({ policy, timedPolicies } = await ecoFixture())

    supervisor = new Supervisor()
    await supervisor.startSupervisor("", policy, alice)
    inflationGovernor = supervisor.inflationGovernor
    
  })

  it('fetches from subgraph', async () => {
    const someBlockWhereBalancesExist: number = 7471818
    let balances: [string, BigNumber][] | undefined = await inflationGovernor.fetchBalances(7471818, 'https://api.thegraph.com/subgraphs/name/paged1/policy')
    if(balances) {
      expect(balances.length).to.be.greaterThan(0)
    } else {
      expect(false)
    }
  })

  it.only('orders the balances', async () => {
    let balances: [string, BigNumber][] | undefined = await inflationGovernor.fetchBalances(7471818, 'https://api.thegraph.com/subgraphs/name/paged1/policy')
    if(balances) {
      let [proc, total] = await inflationGovernor.processBalances(balances)
      if (typeof(total) == BigNumber)
      let prev = '0x0000000000000000000000000000000000000000'
      for (const item in proc) {
        expect(item[0]).to.be.greaterThan(prev)
        prev = item[0]
        total.sub()
      }
      const keys = Object.keys(proc)
      const sortedKeys = keys.sort()
      console.log(keys)
      console.log(sortedKeys)
      expect(sortedKeys[0]).to.equal(keys[0])
      expect(sortedKeys[keys.length - 1]).to.equal(keys[keys.length - 1])
    }
  })
})