import * as ethers from 'ethers'

import { Policy, TimedPolicies } from '../typechain-types'

export class TimeGovernor {
  provider: ethers.providers.BaseProvider
  wallet: ethers.Signer
  policy: Policy
  timedPolicy: TimedPolicies
  nextGenStart: number = 0
  triedUpdate: Boolean = false

  constructor(
    provider: ethers.providers.BaseProvider,
    supervisorWallet: ethers.Signer,
    rootPolicy: Policy,
    timedPolicy: TimedPolicies
  ) {
    this.provider = provider
    this.policy = rootPolicy
    this.wallet = supervisorWallet
    this.timedPolicy = timedPolicy
  }

  async startTimer() {
    this.nextGenStart = (
      await this.timedPolicy.nextGenerationWindowOpen()
    ).toNumber()

    this.provider.on('block', async () => {
      const block = await this.provider.getBlock('latest')
      if (block.timestamp > this.nextGenStart && !this.triedUpdate) {
        this.genUpdate()
      }
    })
  }

  async genUpdate() {
    try {
      this.triedUpdate = true
      const tx = await this.timedPolicy.incrementGeneration()
      const rc = await tx.wait()
      if (rc.status === 1) {
        console.log('updated')
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