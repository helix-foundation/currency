/* eslint-disable camelcase */
import * as ethers from 'ethers'

import {
  Policy,
  TimedPolicies,
  CurrencyGovernance__factory,
  CurrencyGovernance,
} from '../typechain-types'

const ID_CURRENCY_GOVERNANCE = ethers.utils.solidityKeccak256(
  ['string'],
  ['CurrencyGovernance']
)
const newGenerationEvent = 'NewGeneration'

export class CurrencyGovernor {
  provider: ethers.providers.BaseProvider
  wallet: ethers.Signer
  policy: Policy
  timedPolicy: TimedPolicies
  currencyGovernance: CurrencyGovernance
  triedUpdateStage: boolean = false
  proposalEnds: number = 0
  votingEnds: number = 0
  stage: number = 0

  constructor(
    provider: ethers.providers.BaseProvider,
    supervisorWallet: ethers.Signer,
    rootPolicy: Policy,
    timedPolicy: TimedPolicies,
    currencyGovernance: CurrencyGovernance
  ) {
    this.provider = provider
    this.policy = rootPolicy
    this.wallet = supervisorWallet
    this.timedPolicy = timedPolicy
    this.currencyGovernance = currencyGovernance
  }

  async setup() {
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

  async stageUpdate() {
    try {
      this.triedUpdateStage = true
      const tx = await this.currencyGovernance.updateStage()
      const rc = await tx.wait()
      if (rc.status === 1) {
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
        console.log(e)
        this.triedUpdateStage = false
      }
    }
  }

  async killListeners() {
    this.timedPolicy.removeAllListeners(newGenerationEvent)
    this.provider.removeAllListeners('block')
  }

  // listeners
  async stageUpdateListener() {
    const timestamp: number = (await this.provider.getBlock('latest')).timestamp
    if (
      !this.triedUpdateStage &&
      ((this.stage === 0 && timestamp > this.proposalEnds) ||
        (this.stage === 1 && timestamp > this.votingEnds))
    ) {
      await this.stageUpdate()
    }
  }

  async newCurrencyGovernanceListener() {
    console.log('updating currencyGovernance')
    this.currencyGovernance = CurrencyGovernance__factory.connect(
      await this.policy.policyFor(ID_CURRENCY_GOVERNANCE),
      this.wallet
    )
    await this.setup()
  }
}
