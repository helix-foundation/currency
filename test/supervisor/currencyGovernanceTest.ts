/* eslint-disable no-unused-vars */
import { ethers } from 'hardhat'
import {
  Policy,
  TimedPolicies,
  CurrencyGovernance,
} from '../../typechain-types'
import { Supervisor } from '../../supervisor/supervisor_master'
import { TimeGovernor } from '../../supervisor/supervisor_timedPolicies'
import { CurrencyGovernor } from '../../supervisor/supervisor_currencyGovernance'
import { expect } from 'chai'

const time = require('../utils/time.ts')

const { ecoFixture } = require('../utils/fixtures')

describe('currencyGovernance_supervisor [@group=13]', () => {
  let alice
  let policy: Policy
  let timedPolicies: TimedPolicies
  let currencyGovernance: CurrencyGovernance

  let supervisor: Supervisor
  let currencyGovernor: CurrencyGovernor
  let timeGovernor: TimeGovernor

  beforeEach(async () => {
    if (timeGovernor) {
      await timeGovernor.killListener()
    }
    // if (currencyGovernor) {
    //     await currencyGovernor.killListener()
    // }
    const accounts = await ethers.getSigners()
    ;[alice] = accounts
    ;({ policy, timedPolicies, currencyGovernance } = await ecoFixture())

    supervisor = new Supervisor()
    await supervisor.startSupervisor('', policy, alice)

    currencyGovernor = supervisor.currencyGovernor
    timeGovernor = supervisor.timeGovernor
    console.log(ethers.provider.listenerCount('block'))
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
      setTimeout(() => resolve(), 6000)
    })
    expect(currencyGovernor.stage).to.equal(2)
  })
  it('computes correctly', async () => {
    const stage = currencyGovernor.stage
    expect(stage).to.equal(0)
    let currTime = await time.latestBlockTimestamp()

    const proposalEnds = currencyGovernor.proposalEnds
    await time.increase(proposalEnds - currTime + 1)
    let result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 8000)
    })
    expect(currencyGovernor.stage).to.equal(1)

    const votingEnds = currencyGovernor.revealEnds
    currTime = await time.latestBlockTimestamp()
    await time.increase(votingEnds - currTime + 1)
    result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 5000)
    })

    expect(currencyGovernor.stage).to.be.greaterThan(2)
  })
  it('updates currencyGovernance properly upon generation increment', async () => {
    let result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 5000)
    })
    const initialCurrGov = currencyGovernor.currencyGovernance.address
    const generationTime = (
      await timeGovernor.timedPolicy.GENERATION_DURATION()
    ).toNumber()
    // console.log(await (await timeGovernor.timedPolicy.generation()).toNumber())

    await time.increase(generationTime + 1)
    result = await new Promise<void>((resolve, reject) => {
      setTimeout(() => resolve(), 8000)
    })
    // console.log(await (await timeGovernor.timedPolicy.generation()).toNumber())
    const newCurrGov = currencyGovernor.currencyGovernance.address
    expect(newCurrGov).to.not.equal(initialCurrGov)
  })
})
