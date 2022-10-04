/* eslint-disable no-unused-vars */
import { ethers } from 'hardhat'
import { Policy } from '../../typechain-types'
import { Supervisor } from '../../supervisor/supervisor'
import { TimeGovernor } from '../../supervisor/timeGovernor'
import { CurrencyGovernor } from '../../supervisor/currencyGovernor'
import { expect } from 'chai'
import { Signer } from 'ethers'

const time = require('../utils/time.ts')

const { ecoFixture } = require('../utils/fixtures')

describe('currencyGovernance_supervisor [@group=13]', () => {
  let alice: Signer
  let policy: Policy

  let supervisor: Supervisor
  let currencyGovernor: CurrencyGovernor
  let timeGovernor: TimeGovernor

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice] = accounts
    ;({ policy } = await ecoFixture())

    supervisor = new Supervisor()
    await supervisor.startSupervisor('', policy, alice)

    currencyGovernor = supervisor.currencyGovernor
    timeGovernor = supervisor.timeGovernor
  })

  afterEach(async () => {
    await supervisor.killAllListeners()
  })

  it('updates stages correctly happy path', async () => {
    const stage = currencyGovernor.stage
    let currTime = await time.latestBlockTimestamp()
    expect(stage).to.equal(0)

    const proposalEnds = currencyGovernor.proposalEnds
    await time.increase(proposalEnds - currTime + 1)
    await time.waitBlockTime()

    expect(currencyGovernor.stage).to.equal(1)

    const votingEnds = currencyGovernor.votingEnds
    currTime = await time.latestBlockTimestamp()
    await time.increase(votingEnds - currTime + 1)
    await time.waitBlockTime()

    expect(currencyGovernor.stage).to.equal(2)
  })

  it('jumps stages if necessary', async () => {
    const stage = currencyGovernor.stage
    let currTime = await time.latestBlockTimestamp()
    expect(stage).to.equal(0)

    const votingEnds = currencyGovernor.votingEnds
    currTime = await time.latestBlockTimestamp()
    await time.increase(votingEnds - currTime + 1)
    await time.waitBlockTime()

    expect(currencyGovernor.stage).to.equal(2)
  })

  it('updates currencyGovernance properly upon generation increment', async () => {
    await time.waitBlockTime()

    const initialCurrGov = currencyGovernor.currencyGovernance.address
    const timeToNextGeneration: number =
      (await timeGovernor.timedPolicy.nextGenerationWindowOpen()).toNumber() -
      (await time.latestBlockTimestamp())

    await time.increase(timeToNextGeneration + 1)
    await time.waitBlockTime(20000)

    const newCurrGov = currencyGovernor.currencyGovernance.address
    expect(newCurrGov).to.not.equal(initialCurrGov)
  })
})
