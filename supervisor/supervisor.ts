/* eslint-disable camelcase */
import * as hre from 'hardhat'
import * as ethers from 'ethers'

import { CurrencyGovernor } from './currencyGovernor'
import { CommunityGovernor } from './communityGovernor'
import { TimeGovernor } from './timeGovernor'
import { InflationGovernor } from './inflationGovernor'
import { Policy__factory, Policy } from '../typechain-types'
require('dotenv').config({ path: '.env' })

const privateKey = process.env.PRIVATE_KEY || ''
const rpcEndpoint = process.env.INFURA_URL || ''
const policyRoot = process.env.POLICY_ROOT || ''

export class Supervisor {
  timeGovernor!: TimeGovernor
  currencyGovernor!: CurrencyGovernor
  inflationGovernor!: InflationGovernor
  communityGovernor!: CommunityGovernor
  provider!: ethers.providers.BaseProvider
  rootPolicy?: Policy
  wallet?: ethers.Signer
  production: boolean = false

  async start() {
    this.provider = new ethers.providers.JsonRpcProvider(rpcEndpoint)
    this.wallet = new ethers.Wallet(privateKey, this.provider)
    this.rootPolicy = Policy__factory.connect(policyRoot, this.wallet)
    this.production = true

    await this.startGovernors()
  }

  async startTestSupervisor(policy: Policy, signer: ethers.Signer) {
    // test
    console.log('test')
    // @ts-ignore
    this.provider = hre.ethers.provider
    this.wallet = signer
    this.rootPolicy = policy

    await this.startGovernors()
  }

  async startGovernors() {
    if (this.rootPolicy && this.wallet && this.provider) {
      this.timeGovernor = new TimeGovernor(
        this.provider,
        this.wallet,
        this.rootPolicy
      )

      await this.timeGovernor.setup()
      await this.timeGovernor.startListeners()

      this.currencyGovernor = new CurrencyGovernor(
        this.provider,
        this.wallet,
        this.rootPolicy
      )

      await this.currencyGovernor.setup()
      await this.currencyGovernor.startListeners()

      this.inflationGovernor = new InflationGovernor(
        this.provider,
        this.wallet,
        this.rootPolicy,
        this.production
      )

      await this.inflationGovernor.setup()
      await this.inflationGovernor.startListeners()

      this.communityGovernor = new CommunityGovernor(
        this.provider,
        this.wallet,
        this.rootPolicy
      )

      await this.communityGovernor.setup()
      await this.communityGovernor.startListeners()
    }
  }

  async killAllListeners() {
    await this.provider.removeAllListeners('block')
    await this.communityGovernor.killListeners()
    await this.currencyGovernor.killListeners()
    await this.inflationGovernor.killListeners()
  }
}
