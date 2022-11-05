/* eslint-disable camelcase */
import * as ethers from 'ethers'

import {
  Policy,
  TimedPolicies,
  TimedPolicies__factory,
  PolicyProposals,
  PolicyProposals__factory,
  PolicyVotes,
  PolicyVotes__factory,
} from '../typechain-types'

import { logError, SupervisorError } from './logError'
import { fetchLatestBlock } from './tools'

const policyDecisionStartEvent: string = 'PolicyDecisionStart'
const supportThresholdReachedEvent: string = 'SupportThresholdReached'
const voteStartEvent: string = 'VoteStart'

const ID_POLICY_PROPOSALS = ethers.utils.solidityKeccak256(
  ['string'],
  ['PolicyProposals']
)
const ID_POLICY_VOTES = ethers.utils.solidityKeccak256(
  ['string'],
  ['PolicyVotes']
)
const ID_TIMED_POLICIES = ethers.utils.solidityKeccak256(
  ['string'],
  ['TimedPolicies']
)

export class CommunityGovernor {
  provider: ethers.providers.BaseProvider
  wallet: ethers.Signer
  policy: Policy
  timedPolicy!: TimedPolicies
  policyProposals!: PolicyProposals
  policyVotes!: PolicyVotes
  policyVotesDeployed: boolean = false
  triedExecute: boolean = false

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

    this.policyProposals = PolicyProposals__factory.connect(
      await this.policy.policyFor(ID_POLICY_PROPOSALS),
      this.wallet
    )

    if (await this.policyProposals.proposalSelected()) {
      this.policyVotes = PolicyVotes__factory.connect(
        await this.policy.policyFor(ID_POLICY_VOTES),
        this.wallet
      )
      this.policyVotesDeployed = true

      if (this.policyVotes.address === ethers.constants.AddressZero) {
        this.triedExecute = true
      }
    }
  }

  async startListeners() {
    this.timedPolicy.on(
      policyDecisionStartEvent,
      async (policyProposalsAddress) => {
        await this.newPolicyProposalsListener(policyProposalsAddress)
      }
    )

    this.policyProposals.once(
      supportThresholdReachedEvent,
      this.deployProposalVotingListener.bind(this)
    )

    this.policyProposals.once(voteStartEvent, async (policyVotesAddress) => {
      await this.fetchPolicyVotesListener(policyVotesAddress)
    })

    this.provider.on('block', this.executePolicyListener.bind(this))
  }

  async deployProposalVotingListener() {
    try {
      await this.policyProposals.deployProposalVoting()
    } catch (e) {
      if (
        (await this.policyProposals.proposalToConfigure()) !==
        ethers.constants.AddressZero
      ) {
        // error logging
        logError({
          type: SupervisorError.DeployVoting,
          error: e,
        })
        setTimeout(this.deployProposalVotingListener.bind(this), 1000)
      }
    }
  }

  async fetchPolicyVotesListener(policyVotesAddress: string) {
    this.policyVotes = PolicyVotes__factory.connect(
      policyVotesAddress,
      this.wallet
    )
    this.policyVotesDeployed = true
  }

  async executePolicyListener() {
    if (this.policyVotesDeployed && !this.triedExecute) {
      const currentTime: number = (await fetchLatestBlock(this.provider))
        .timestamp
      const reqTime: number =
        (await this.policyVotes.voteEnds()).toNumber() +
        (await this.policyVotes.ENACTION_DELAY()).toNumber()
      const reqStake: ethers.BigNumber = (
        await this.policyVotes.totalStake()
      ).div(2)
      const yesStake: ethers.BigNumber = await this.policyVotes.yesStake()
      if (currentTime > reqTime && yesStake > reqStake) {
        this.triedExecute = true
        try {
          const tx = await this.policyVotes.execute()
          const rc = await tx.wait()
          if (rc.status) {
            // done
            console.log('executed!!')
          }
        } catch (e) {
          if (
            (await this.policy.policyFor(ID_POLICY_VOTES)) !==
            ethers.constants.AddressZero
          ) {
            // error logging
            logError({
              type: SupervisorError.Execute,
              error: e,
            })
          }
        }
      }
    }
  }

  async killListeners() {
    await this.timedPolicy.removeAllListeners(policyDecisionStartEvent)
    await this.policyProposals.removeAllListeners(supportThresholdReachedEvent)
    await this.policyProposals.removeAllListeners(voteStartEvent)
  }

  async newPolicyProposalsListener(policyProposalsAddress: string) {
    await this.killListeners()
    this.policyProposals = PolicyProposals__factory.connect(
      policyProposalsAddress,
      this.wallet
    )
    this.policyProposals.once(
      supportThresholdReachedEvent,
      this.deployProposalVotingListener.bind(this)
    )
    this.policyProposals.once(
      voteStartEvent,
      this.fetchPolicyVotesListener.bind(this)
    )
    this.triedExecute = false
    this.policyVotesDeployed = false
  }
}
