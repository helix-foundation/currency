/* eslint-disable no-unused-vars */
import { ethers, expect } from 'hardhat'
import {
  Policy,
  TimedPolicies,
  CurrencyGovernance,
} from '../../typechain-types'
import { Supervisor } from '../../supervisor/supervisor_master'
import { TimeGovernor } from '../../supervisor/supervisor_timedPolicies'
import { CurrencyGovernor } from '../../supervisor/supervisor_currencyGovernance'
// import { TimedPolicies, TimedPolicies } from '../../typechain-types/TimedPolicies'

const time = require('../utils/time.ts')

const { ecoFixture } = require('../utils/fixtures')

describe('currencyGovernance_supervisor [@group=4]', () => {
  let alice
  let policy: Policy
  let timedPolicies: TimedPolicies
  let currencyGovernance: CurrencyGovernance

  let supervisor: Supervisor
  let currencyGovernor: CurrencyGovernor
  let timeGovernor: TimeGovernor

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice] = accounts
    ;({ policy, timedPolicies, currencyGovernance } = await ecoFixture())

    supervisor = new Supervisor()
    await supervisor.testStartSupervisor(policy, alice)

    currencyGovernor = supervisor.currencyGovernor
  })
  it('updates stages correctly happy path', async () => {
    const stage = currencyGovernor.stage
    let currTime = await time.latestBlockTimestamp()
    expect(stage).to.equal(0)

    const proposalEnds = currencyGovernor.proposalEnds
    await time.increase(proposalEnds - currTime + 1)
    let result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 5000)
    })
    expect(currencyGovernor.stage).to.equal(1)

    const votingEnds = currencyGovernor.votingEnds
    currTime = await time.latestBlockTimestamp()
    await time.increase(votingEnds - currTime + 1)
    result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 5000)
    })
    expect(currencyGovernor.stage).to.equal(2)

    const revealEnds = currencyGovernor.revealEnds
    currTime = await time.latestBlockTimestamp()
    await time.increase(revealEnds - currTime + 1)
    result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 5000)
    })
    expect(currencyGovernor.stage).to.be.greaterThan(2)
  })
  it('jumps stages if necessary', async () => {
    const stage = currencyGovernor.stage
    let currTime = await time.latestBlockTimestamp()
    expect(stage).to.equal(0)

    const votingEnds = currencyGovernor.votingEnds
    currTime = await time.latestBlockTimestamp()
    await time.increase(votingEnds - currTime + 1)
    const result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 5000)
    })
    expect(currencyGovernor.stage).to.equal(2)
  })
  it('computes correctly', async () => {
    const stage = currencyGovernor.stage
    console.log(currencyGovernor.currencyGovernance.address)
    expect(stage).to.equal(0)
    let currTime = await time.latestBlockTimestamp()

    const proposalEnds = currencyGovernor.proposalEnds
    await time.increase(proposalEnds - currTime + 2)
    let result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 8000)
    })
    console.log(`currtime is         ${Number(await time.latestBlockTimestamp())}`)
    console.log(`expected to be past ${proposalEnds}`)
    console.log(currencyGovernor.currencyGovernance.address)
    expect(currencyGovernor.stage).to.equal(1)

    const votingEnds = currencyGovernor.revealEnds
    currTime = await time.latestBlockTimestamp()
    await time.increase(votingEnds - currTime + 1)
    result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 5000)
    })
    // expect(currencyGovernor.stage).to.equal(2)
    // console.log(`currtime is         ${Number(await time.latestBlockTimestamp())}`)
    // console.log(`expected to be past ${revealEnds}`)
    expect(currencyGovernor.stage).to.be.greaterThan(2)
  })
  it('updates currencyGovernance properly upon generation increment', async () => {
    timeGovernor = supervisor.timeGovernor
    const initialCurrGov = currencyGovernor.currencyGovernance.address
    const generationTime = (
      await timeGovernor.timedPolicy.GENERATION_DURATION()
    ).toNumber()
    // console.log(await (await timeGovernor.timedPolicy.generation()).toNumber())

    await time.increase(generationTime + 1)
    let result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 5000)
    })
    await time.advanceBlock()
    result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 5000)
    })

    // console.log(await (await timeGovernor.timedPolicy.generation()).toNumber())
    const newCurrGov = currencyGovernor.currencyGovernance.address
    expect(newCurrGov).to.not.equal(initialCurrGov)
  })
})
