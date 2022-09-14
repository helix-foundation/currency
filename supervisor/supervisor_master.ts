/* eslint-disable camelcase */
/* eslint-disable no-useless-constructor */
import * as hre from 'hardhat'
import * as ethers from 'ethers'
// const path = require('path');

import { TimeGovernor } from './supervisor_timedPolicies'
import { CurrencyGovernor } from './supervisor_currencyGovernance'
import { InflationGovernor } from './supervisor_randomInflation'
// import { CommunityGovernor } from "./supervisor_communityGovernance"
import {
  Policy__factory,
  Policy,
  TimedPolicies__factory,
  TimedPolicies,
  CurrencyGovernance__factory,
  CurrencyGovernance,
} from '../typechain-types'
require('dotenv').config({ path: '../.env' })
// import { ethers } from "hardhat"
const fs = require('fs')
// import { CurrencyGovernance } from "../typechain-types/CurrencyGovernance";

const pk = process.env.PRIVATE_KEY || ''

const ID_TIMED_POLICIES = ethers.utils.solidityKeccak256(
  ['string'],
  ['TimedPolicies']
)
const ID_CURRENCY_GOVERNANCE = ethers.utils.solidityKeccak256(
  ['string'],
  ['CurrencyGovernance']
)

export class Supervisor {
  timeGovernor!: TimeGovernor
  currencyGovernor!: CurrencyGovernor
  inflationGovernor!: InflationGovernor
  provider!: ethers.providers.BaseProvider
  rootPolicy!: Policy
  wallet!: ethers.Signer
  production: boolean = false

  constructor() {}

  async startSupervisor(
    filepath?: string,
    policy?: Policy,
    signer?: ethers.Signer
  ) {
    if (filepath) {
      // prod
      let args = fs.readFileSync(filepath)
      args = args.toString().split('\n')
      const rpc: string = args[0]
      const root: string = args[1]
      this.provider = new ethers.providers.JsonRpcProvider(rpc)
      this.wallet = new ethers.Wallet(pk, this.provider)
      this.rootPolicy = Policy__factory.connect(root, this.wallet)
      this.production = true
    } else {
      // test
      if (signer && policy) {
        this.provider = hre.ethers.provider
        this.wallet = signer
        this.rootPolicy = policy
      }
    }

    return this.startModules(this.provider, this.wallet, this.rootPolicy)
  }

  async startModules(
    provider: ethers.providers.BaseProvider,
    wallet: ethers.Signer,
    rootPolicy: Policy
  ) {
    const timedPolicy: TimedPolicies = TimedPolicies__factory.connect(
      await rootPolicy.policyFor(ID_TIMED_POLICIES),
      wallet
    )
    const currencyGovernance: CurrencyGovernance =
      CurrencyGovernance__factory.connect(
        await rootPolicy.policyFor(ID_CURRENCY_GOVERNANCE),
        wallet
      )

    this.timeGovernor = new TimeGovernor(
      provider,
      wallet,
      rootPolicy,
      timedPolicy
    )
    await this.timeGovernor.startTimer()

    this.currencyGovernor = new CurrencyGovernor(
      provider,
      wallet,
      rootPolicy,
      timedPolicy,
      currencyGovernance
    )
    await this.currencyGovernor.setup()
    await this.currencyGovernor.startListeners()

    this.inflationGovernor = new InflationGovernor(
      provider,
      wallet,
      rootPolicy,
      timedPolicy,
      this.production
    )
    this.inflationGovernor.setup()
  }
}
