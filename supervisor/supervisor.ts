/* eslint-disable camelcase */
import * as hre from 'hardhat'
import * as ethers from 'ethers'

import { CurrencyGovernor } from './currencyGovernor'
import { CommunityGovernor } from './communityGovernor'
import { TimeGovernor } from './timeGovernor'
import { InflationGovernor } from './inflationGovernor'
import { Policy__factory, Policy } from '../typechain-types'
import { EcoConfigService } from './services/eco-config.service'
import { SecretsManagerService } from './services/secrets-manager.service'

require('dotenv').config({ path: '.env' })

const rpcEndpoint = process.env.INFURA_URL || ''
const policyRoot = process.env.POLICY_ROOT || ''
const subgraphsEndpoint = process.env.SUBGRAPHS_URL || ''

export class Supervisor {
  timeGovernor!: TimeGovernor
  currencyGovernor!: CurrencyGovernor
  inflationGovernor!: InflationGovernor
  communityGovernor!: CommunityGovernor
  provider!: ethers.providers.BaseProvider
  rootPolicy?: Policy
  subgraphsUrl!: string
  wallet?: ethers.Signer
  production: boolean = false
  configService!: EcoConfigService
  ecoConfig!: any
  privateKey!: string

  async start() {
    await this.init()

    this.provider = new ethers.providers.JsonRpcProvider(rpcEndpoint)
    this.wallet = new ethers.Wallet(this.privateKey, this.provider)
    this.rootPolicy = Policy__factory.connect(policyRoot, this.wallet)
    this.subgraphsUrl = subgraphsEndpoint
    this.production = true

    await this.startGovernors()
  }

  /**
   * Initializes the configs and loads the private key
   */
  async init() {
    // init the configs
    this.configService = new EcoConfigService(new SecretsManagerService())
    await this.configService.secretsManagerInitializationComplete()
    this.ecoConfig = this.configService.getConfig()

    let { privateKey } = this.ecoConfig.Supervisor
    privateKey = Object.values(JSON.parse(privateKey))[0]
    this.privateKey = privateKey
  }

  async startTestSupervisor(policy: Policy, signer: ethers.Signer) {
    // test
    console.log('test')
    // @ts-ignore
    this.provider = hre.ethers.provider
    this.wallet = signer
    this.rootPolicy = policy
    this.subgraphsUrl = 'https://api.thegraph.com/subgraphs/name/paged1/policy'

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
        this.subgraphsUrl,
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
