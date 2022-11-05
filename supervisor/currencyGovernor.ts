/* eslint-disable camelcase */
import * as ethers from 'ethers'

import {
  Policy,
  TimedPolicies__factory,
  TimedPolicies,
  CurrencyGovernance__factory,
  CurrencyGovernance,
} from '../typechain-types'
import { logError, SupervisorError } from './logError'
import { fetchLatestBlock } from './tools'

const ID_TIMED_POLICIES = ethers.utils.solidityKeccak256(
  ['string'],
  ['TimedPolicies']
)
const ID_CURRENCY_GOVERNANCE = ethers.utils.solidityKeccak256(
  ['string'],
  ['CurrencyGovernance']
)
const newGenerationEvent = 'NewGeneration'

export class CurrencyGovernor {
  provider: ethers.providers.BaseProvider
  wallet: ethers.Signer
  policy: Policy
  timedPolicy!: TimedPolicies
  currencyGovernance!: CurrencyGovernance
  triedUpdateStage: boolean = false
  proposalEnds: number = 0
  votingEnds: number = 0
  stage: number = 0

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
    this.currencyGovernance = CurrencyGovernance__factory.connect(
      await this.policy.policyFor(ID_CURRENCY_GOVERNANCE),
      this.wallet
    )
    this.proposalEnds = (
      await this.currencyGovernance.proposalEnds()
    ).toNumber()
    this.votingEnds = (await this.currencyGovernance.votingEnds()).toNumber()
    this.stage = await this.currencyGovernance.currentStage()
  }

  async startListeners() {
    this.provider.on('block', this.stageUpdateListener.bind(this))
    this.timedPolicy.on(
      newGenerationEvent,
      this.newCurrencyGovernanceListener.bind(this)
    )
  }

  async killListeners() {
    await this.timedPolicy.removeAllListeners(newGenerationEvent)
  }

  async stageUpdateListener() {
    const timestamp: number = (await fetchLatestBlock(this.provider)).timestamp
    if (
      !this.triedUpdateStage &&
      ((this.stage === 0 && timestamp > this.proposalEnds) ||
        (this.stage === 1 && timestamp > this.votingEnds))
    ) {
      try {
        this.triedUpdateStage = true
        const tx = await this.currencyGovernance.updateStage()
        const rc = await tx.wait()
        if (rc.status) {
          this.triedUpdateStage = false
          this.stage = await this.currencyGovernance.currentStage()
        }
      } catch (e) {
        if ((await this.currencyGovernance.currentStage()) > this.stage) {
          // stage has already been updated
          this.triedUpdateStage = false
          this.stage = await this.currencyGovernance.currentStage()
        } else {
          // error logging
          logError({
            type: SupervisorError.UpdateStage,
            error: e,
          })
          this.triedUpdateStage = false
        }
      }
    }
  }

  async newCurrencyGovernanceListener() {
    console.log('updating currencyGovernance')
    await this.setup()
  }
}
