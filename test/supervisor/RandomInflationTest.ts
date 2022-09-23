/* eslint-disable no-unused-vars */
import { ethers } from 'hardhat'
import { expect } from 'chai'
import { Policy, CurrencyGovernance } from '../../typechain-types'
import { Supervisor } from '../../supervisor/supervisor_master'
import { InflationGovernor } from '../../supervisor/supervisor_randomInflation'
import { CurrencyGovernor } from '../../supervisor/supervisor_currencyGovernance'
import { Signer } from 'ethers'
import { TimeGovernor } from '../../supervisor/supervisor_timedPolicies'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'

const time = require('../utils/time.ts')

const { ecoFixture } = require('../utils/fixtures')

describe('RandomInflation [@group=13]', () => {
  let alice: SignerWithAddress
  let bob: SignerWithAddress
  let charlie: SignerWithAddress
  let dave: Signer
  let initInflation
  let policy: Policy
  let supervisor: Supervisor
  let timeGovernor: TimeGovernor
  let currencyGovernor: CurrencyGovernor
  let inflationGovernor!: InflationGovernor

  const hash = (x: any) =>
    ethers.utils.solidityKeccak256(
      ['bytes32', 'address', 'address[]'],
      [x[0], x[1], x[2]]
    )
  const inflationVote = 10
  const rewardVote = 20000

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie, dave] = accounts
    const trustees = [
      await bob.getAddress(),
      await charlie.getAddress(),
      await dave.getAddress(),
    ]

    ;({ policy, faucet: initInflation } = await ecoFixture(trustees))

    await initInflation.mint(
      await accounts[0].getAddress(),
      '50000000000000000000000000'
    )

    if (timeGovernor) {
      console.log('kill time listener')
      await timeGovernor.killListener()
    }
    if (inflationGovernor) {
      console.log('killing inflation listeners')
      await inflationGovernor.killListeners()
    }

    supervisor = new Supervisor()
    await supervisor.startSupervisor('', policy, alice)
    timeGovernor = supervisor.timeGovernor
    currencyGovernor = supervisor.currencyGovernor
    inflationGovernor = supervisor.inflationGovernor

    const governance: CurrencyGovernance = await ethers.getContractAt(
      'CurrencyGovernance',
      currencyGovernor.currencyGovernance.address
    )
    await governance
      .connect(bob)
      .propose(inflationVote, rewardVote, 0, 0, '1000000000000000000', '')
    await time.increase(3600 * 24 * 10)

    const bobvote: any = [
      ethers.utils.randomBytes(32),
      await bob.getAddress(),
      [await bob.getAddress()],
    ]
    await governance.connect(bob).commit(hash(bobvote))
    const charlievote: any = [
      ethers.utils.randomBytes(32),
      await charlie.getAddress(),
      [await bob.getAddress()],
    ]
    await governance.connect(charlie).commit(hash(charlievote))
    const davevote: any = [
      ethers.utils.randomBytes(32),
      await dave.getAddress(),
      [await bob.getAddress()],
    ]
    await governance.connect(dave).commit(hash(davevote))
    await time.increase(3600 * 24 * 3)
    await time.waitBlockTime()

    await governance.connect(bob).reveal(bobvote[0], bobvote[2])
    await governance.connect(charlie).reveal(charlievote[0], charlievote[2])
    await governance.connect(dave).reveal(davevote[0], davevote[2])
  })

  it('fetches new randomInflation stuff on newInflation', async () => {
    expect(inflationGovernor.randomInflation).to.be.undefined
    await time.increase(3600 * 24 * 1)
    await time.waitBlockTime(25000)

    expect(inflationGovernor.randomInflation).to.not.be.undefined
  })

  it('gets primal and commits vdfSeed', async () => {
    expect(inflationGovernor.vdfSeed).to.be.undefined
    await time.increase(3600 * 24 * 1)
    await time.waitBlockTime()

    await time.advanceBlock()
    await time.waitBlockTime(5000)
    await time.advanceBlock()
    await time.waitBlockTime(5000)
    await time.advanceBlock()
    await time.waitBlockTime(5000)
    await time.advanceBlock()
    await time.waitBlockTime(5000)


    expect(inflationGovernor.vdfSeed).to.not.be.undefined
  })

  it('proves and submits vdfSeed', async () => {
    expect(inflationGovernor.vdfOutput).to.be.undefined
    await time.increase(3600 * 24 * 1)
    await time.waitBlockTime()

    const unsetSeed: string = await inflationGovernor.randomInflation.seed()
    await time.advanceBlock()
    await time.waitBlockTime(5000)
    await time.advanceBlock()
    await time.waitBlockTime(5000)
    await time.advanceBlock()
    await time.waitBlockTime(5000)
    await time.advanceBlock()
    await time.waitBlockTime(5000)

    expect(await inflationGovernor.randomInflation.seed()).to.not.equal(
      unsetSeed
    )
  })
})
