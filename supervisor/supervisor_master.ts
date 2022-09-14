/* eslint-disable camelcase */
import * as hre from 'hardhat'
import * as ethers from 'ethers'

import { TimeGovernor } from './supervisor_timedPolicies'
import {
  Policy__factory,
  Policy,
  TimedPolicies__factory,
  TimedPolicies,
} from '../typechain-types'
require('dotenv').config({ path: '../.env' })
const fs = require('fs')

const pk = process.env.PRIVATE_KEY || ''

const ID_TIMED_POLICIES = ethers.utils.solidityKeccak256(
  ['string'],
  ['TimedPolicies']
)

export class Supervisor {
  timeGovernor!: TimeGovernor
  provider?: ethers.providers.BaseProvider
  rootPolicy?: Policy
  wallet?: ethers.Signer

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
      } catch (e) {
        throw new Error('bad filepath, rpcURL, pk or rootPolicy address')
      }
    } else if (signer && policy) {
      // test
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
      const timedPolicy: TimedPolicies = TimedPolicies__factory.connect(
        await this.rootPolicy.policyFor(ID_TIMED_POLICIES),
        this.wallet
      )
      this.timeGovernor = new TimeGovernor(
        this.provider,
        this.wallet,
        this.rootPolicy,
        timedPolicy
      )
      this.timeGovernor.startTimer()
    }
  }
}
