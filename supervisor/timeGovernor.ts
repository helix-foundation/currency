/* eslint-disable camelcase */
import * as ethers from 'ethers'

import {
  Policy,
  TimedPolicies,
  TimedPolicies__factory,
  TrustedNodes,
  TrustedNodes__factory,
} from '../typechain-types'

const ID_TIMED_POLICIES = ethers.utils.solidityKeccak256(
  ['string'],
  ['TimedPolicies']
)
const ID_TRUSTED_NODES = ethers.utils.solidityKeccak256(
  ['string'],
  ['TrustedNodes']
)

export class TimeGovernor {
  provider: ethers.providers.BaseProvider
  wallet: ethers.Signer
  policy: Policy
  timedPolicy!: TimedPolicies
  trustedNodes!: TrustedNodes
  nextGenStart: number = 0
  yearEnd: number = 0
  generation: number = 0
  triedGenerationIncrement: Boolean = false
  triedAnnualUpdate: Boolean = false

  constructor(
    provider: ethers.providers.BaseProvider,
    supervisorWallet: ethers.Signer,
    rootPolicy: Policy
  ) {
    this.provider = provider
    this.policy = rootPolicy
    this.wallet = supervisorWallet
  }

  async setup() {
    this.timedPolicy = TimedPolicies__factory.connect(
      await this.policy.policyFor(ID_TIMED_POLICIES),
      this.wallet
    )
    this.trustedNodes = TrustedNodes__factory.connect(
      await this.policy.policyFor(ID_TRUSTED_NODES),
      this.wallet
    )

    this.nextGenStart = (
      await this.timedPolicy.nextGenerationWindowOpen()
    ).toNumber()

    this.generation = (await this.timedPolicy.generation()).toNumber()
    this.yearEnd = (await this.trustedNodes.yearEnd()).toNumber()
  }

  async startListeners() {
    this.provider.on('block', this.generationUpdateListener.bind(this))
    // listener for annualUpdate
    this.provider.on('block', this.annualUpdateListener.bind(this))
  }

  async annualUpdateListener() {
    const block = await this.provider.getBlock('latest')
    if (block.timestamp > this.yearEnd && !this.triedAnnualUpdate) {
      try {
        this.triedAnnualUpdate = true
        const tx = await this.trustedNodes.annualUpdate()
        const rc = await tx.wait()
        if (rc.status === 1) {
          console.log(
            `annualUpdate complete, previous year's trustee rewards drip has begun`
          )
          this.triedAnnualUpdate = false
          this.yearEnd = (await this.trustedNodes.yearEnd()).toNumber()
        }
      } catch (e) {
        if ((await this.trustedNodes.yearEnd()).toNumber() > this.yearEnd) {
          // annual update successful
          this.triedAnnualUpdate = false
          this.yearEnd = (await this.trustedNodes.yearEnd()).toNumber()
        } else {
          // error logging
          console.log(e)
          this.triedAnnualUpdate = false
        }
      }
    }
  }

  async generationUpdateListener() {
    const block = await this.provider.getBlock('latest')
    if (block.timestamp > this.nextGenStart && !this.triedGenerationIncrement) {
      try {
        this.triedGenerationIncrement = true
        const tx = await this.timedPolicy.incrementGeneration()
        const rc = await tx.wait()
        if (rc.status === 1) {
          this.generation = (await this.timedPolicy.generation()).toNumber()
          console.log(`generation incremented to ${this.generation}`)
          this.triedGenerationIncrement = false
          this.nextGenStart = (
            await this.timedPolicy.nextGenerationWindowOpen()
          ).toNumber()
        }
      } catch (e) {
        if (
          (await this.timedPolicy.nextGenerationWindowOpen()).toNumber() >
          this.nextGenStart
        ) {
          // generation has been updated
          this.triedGenerationIncrement = false
          this.nextGenStart = (
            await this.timedPolicy.nextGenerationWindowOpen()
          ).toNumber()
        } else {
          // error logging
          console.log(e)
          this.triedGenerationIncrement = false
        }
      }
    }
  }
}
