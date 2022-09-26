/* eslint-disable camelcase */
import * as hre from 'hardhat'
import * as ethers from 'ethers'

import { CurrencyGovernor } from './supervisor_currencyGovernance'
import { CommunityGovernor } from './supervisor_communityGovernance'
import { TimeGovernor } from './supervisor_timedPolicies'
import { Policy__factory, Policy } from '../typechain-types'
require('dotenv').config({ path: '../.env' })
const fs = require('fs')

const pk = process.env.PRIVATE_KEY || ''

export class Supervisor {
  timeGovernor!: TimeGovernor
  currencyGovernor!: CurrencyGovernor
  communityGovernor!: CommunityGovernor
  provider?: ethers.providers.BaseProvider
  rootPolicy?: Policy
  wallet?: ethers.Signer
  production: boolean = false

  async startSupervisor(
    filepath?: string,
    policy?: Policy,
    signer?: ethers.Signer
  ) {
    if (filepath) {
      // prod
      try {
        let args = fs.readFileSync(filepath)
        args = args.toString().split('\n')
        const rpc: string = args[0]
        const root: string = args[1]
        this.provider = new ethers.providers.JsonRpcProvider(rpc)
        this.wallet = new ethers.Wallet(pk, this.provider)
        this.rootPolicy = Policy__factory.connect(root, this.wallet)
        this.production = true
      } catch (e) {
        throw new Error('bad filepath, rpcURL, pk or rootPolicy address')
      }
    } else if (signer && policy) {
      // test
      console.log('test')
      this.provider = hre.ethers.provider
      this.wallet = signer
      this.rootPolicy = policy
    } else {
      throw new Error('bad inputs')
    }

    await this.startModules()
  }

  async startModules() {
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

      this.communityGovernor = new CommunityGovernor(
        this.provider,
        this.wallet,
        this.rootPolicy
      )
      await this.communityGovernor.setup()
      await this.communityGovernor.startListeners()
    }
  }
}
