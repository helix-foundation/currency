/* eslint-disable camelcase */
import * as ethers from 'ethers'

import {
  Policy,
  TimedPolicies,
  TimedPolicies__factory,
} from '../typechain-types'

const ID_TIMED_POLICIES = ethers.utils.solidityKeccak256(
  ['string'],
  ['TimedPolicies']
)

export class TimeGovernor {
  provider: ethers.providers.BaseProvider
  wallet: ethers.Signer
  policy: Policy
  timedPolicy!: TimedPolicies
  nextGenStart: number = 0
  triedUpdate: Boolean = false
  generation: number = 0

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
    this.nextGenStart = (
      await this.timedPolicy.nextGenerationWindowOpen()
    ).toNumber()
    this.generation = (await this.timedPolicy.generation()).toNumber()
  }

  async startListeners() {
    this.provider.on('block', async () => {
      await this.generationUpdateListener()
    })
    // listener for annualUpdate
  }

  async generationUpdateListener() {
    const block = await this.provider.getBlock('latest')
    if (block.timestamp > this.nextGenStart && !this.triedUpdate) {
      try {
        this.triedUpdate = true
        const tx = await this.timedPolicy.incrementGeneration()
        const rc = await tx.wait()
        if (rc.status === 1) {
          this.generation = (await this.timedPolicy.generation()).toNumber()
          console.log(`generation incremented to ${this.generation}`)
          this.triedUpdate = false
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
          this.triedUpdate = false
          this.nextGenStart = (
            await this.timedPolicy.nextGenerationWindowOpen()
          ).toNumber()
        } else {
          // error logging
          console.log(e)
          this.triedUpdate = false
        }
      }
    }
  }

  async killListener() {
    // pending stackoverflow answers on how to make this not universal
    this.provider.removeAllListeners('block')
  }
}
