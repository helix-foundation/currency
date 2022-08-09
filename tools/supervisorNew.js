require('dotenv').config()
const web3 = require('web3')
const { ethers } = require('ethers')
const fs = require('fs')
const path = require('path')

const PRIVATE_KEY = process.env.PRIVATE_KEY

// const { getTree, answer, arrayToTree } = require('./randomInflationUtils');

/* eslint-disable no-console */
/* eslint no-bitwise: 0 */
/* eslint-disable no-param-reassign, no-await-in-loop */
/* eslint-disable no-lone-blocks, no-underscore-dangle */

let provider

function getABI(contract) {
  try {
    // TODO: replace this fs stuff with a more explicit import
    return JSON.parse(
      fs.readFileSync(
        path.resolve(__dirname, `../build/contracts/${contract}.json`)
      )
    )
  } catch (e) {
    if (global.artifacts === undefined) {
      // logger.info(e);
      throw new Error("Run 'truffle compile'", e)
    }
    return artifacts.require(contract)._json
  }
}

// Contract ABIs and Bytecode
const PolicyABI = getABI('Policy')
const ECO = getABI('ECO')
const TimedPoliciesABI = getABI('TimedPolicies')
const PolicyProposalsABI = getABI('PolicyProposals')
const PolicyVotesABI = getABI('PolicyVotes')
// const TrustedNodesABI = getABI('TrustedNodes');
const VDFVerifierABI = getABI('VDFVerifier')
const CurrencyGovernanceABI = getABI('CurrencyGovernance')
const CurrencyTimerABI = getABI('CurrencyTimer')
const InflationABI = getABI('RandomInflation')
const InflationRootHashProposalABI = getABI('InflationRootHashProposal')

const ID_TIMED_POLICIES = web3.utils.soliditySha3('TimedPolicies')
const ID_CURRENCY_TIMER = web3.utils.soliditySha3('CurrencyTimer')
const ID_CURRENCY_GOVERNANCE = web3.utils.soliditySha3('CurrencyGovernance')
// const ID_TRUSTED_NODES = web3.utils.soliditySha3('TrustedNodes');
// const ID_ERC20TOKEN = web3.utils.soliditySha3('ERC20Token');
const ID_ECO = web3.utils.soliditySha3('ECO')
const ID_POLICY_PROPOSALS = web3.utils.soliditySha3('PolicyProposals')
const ID_POLICY_VOTES = web3.utils.soliditySha3('PolicyVotes')

// const { toBN } = web3.utils;

// useful time constants
const HOUR = 3600 * 1000
const DAY = 24 * HOUR

// time before next generation that auto refund is called
const REFUND_BUFFER = HOUR
// length of a generation
// this is the default value, overwritten by TimedPolices.GENERATION_DURATION
const GENERATION_TIME = 14 * DAY

class Supervisor {
  constructor(policyAddr, signer) {
    this.signer = signer

    this.policy = new ethers.Contract(policyAddr, PolicyABI.abi, this.signer)

    this.cumulativeBalances = {}
  }

  async updateGeneration() {
    if (this.timestamp > this.nextGenerationStart) {
      await this.timedPolicies.incrementGeneration()
      await this.getTxHistory(this.currentGenerationStartBlock)
      this.currentGenerationStartBlock = this.blockNumber
      this.currentGenerationStartTime = this.timestamp
      this.currentGeneration += 1
      this.nextGenerationStartTime =
        this.currentGenerationStartTime + GENERATION_TIME
    }
  }

  async updateContracts() {
    // called the block after generation update
    // fetches all the new contract addresses from the registry

    this.policyProposals = new ethers.Contract(
      await this.policy.policyFor(ID_POLICY_PROPOSALS),
      PolicyProposalsABI.abi,
      this.signer
    )
    console.log(`policyProposals address is: ${this.policyProposals.address}`)

    this.currencyGovernance = new ethers.Contract(
      await this.policy.policyFor(ID_CURRENCY_GOVERNANCE),
      CurrencyGovernanceABI.abi,
      this.signer
    )
    console.log(
      `currencyGovernance address is: ${this.currencyGovernance.address}`
    )

    let filter = this.currencyTimer.filters.NewInflation()
    let events = await this.currencyTimer.queryFilter(
      filter,
      this.currentGenerationStartBlock,
      'latest'
    )
    if (events.length > 0) {
      const randomInflationAddress = events[events.length - 1].args[0]
      this.randomInflation = new ethers.Contract(
        randomInflationAddress,
        InflationABI.abi,
        this.signer
      )
      console.log(`randomInflation address is: ${this.randomInflation.address}`)
    }

    filter = this.randomInflation.filters.InflationStart()
    events = await this.randomInflation.queryFilter(
      filter,
      this.currentGenerationStartBlock,
      'latest'
    )
    if (events.length > 0) {
      const startInflationEvent = events[events.length - 1]

      const vdfVerifierAddress = startInflationEvent.args[0]
      this.vdfVerifier = new ethers.Contract(
        vdfVerifierAddress,
        VDFVerifierABI.abi,
        this.signer
      )

      console.log(`VDFVerifier address is: ${this.vdfVerifier.address}`)

      const inflationRootHashProposalAddress = startInflationEvent.args[1]
      this.inflationRootHashProposal = new ethers.Contract(
        inflationRootHashProposalAddress,
        InflationRootHashProposalABI.abi,
        this.signer
      )

      console.log(
        `InflationRootHashProposal address is: ${this.inflationRootHashProposal.address}`
      )
    }
  }

  async manageCommunityGovernance() {
    this.fetchPolicyVotes()

    this.deployProposalVoting()

    this.executeProposal()
  }

  async fetchPolicyVotes() {
    if (!this.policyVotes && (await this.policyProposals.proposalSelected)) {
      this.policyvotes = new ethers.Contract(
        await this.policy.policyFor(ID_POLICY_VOTES),
        PolicyVotesABI.abi,
        this.signer
      )
    }
  }

  async deployProposalVoting() {
    if (
      (await !this.policyProposals.proposalSelected) &&
      this.timestamp < (await this.policyProposals.proposalEnds)
    ) {
      // find out if a proposal is ready to be voted on, then deploy policyVotes
      const filter = this.policyProposals.filters.SupportThresholdReached()
      const events = this.policyProposals.queryFilter(
        filter,
        this.currentGenerationStartBlock,
        'latest'
      )
      // policyProposals instance is created anew every generation, so max 1 such event
      if (events.length === 1) {
        await this.policyProposals.deployProposalVoting()
      }
    }
  }

  async executeProposal() {
    if (this.policyVotes) {
      try {
        const requiredStake = (await this.policyVotes.totalStake()) / 2
        const yesStake = await this.policyVotes.yesStake()
        if (
          yesStake > requiredStake &&
          this.timestamp >
            (await this.policyVotes.voteEnds) +
              (await this.policyVotes.ENACTION_DELAY)
        ) {
          await this.policyVotes.execute()
          this.policyChange = true
        }
      } catch (e) {
        console.log(e)
      }
    }
  }

  async refundUnselectedProposals() {
    // do refunds of unselected proposals
    await this.policyProposals.allProposals().forEach((proposal) => {
      this.policyProposals.refund(proposal)
    })
  }

  async manageCurrencyGovernance() {
    // updates the stage of the currency governance process

    const stage = await this.currencyGovernance.stage()

    if (
      (stage === 0 &&
        this.timestamp >= (await this.currencyGovernance.proposalEnds())) ||
      (stage === 1 &&
        this.timestamp >= (await this.currencyGovernance.votingEnds())) ||
      (stage === 2 &&
        this.timestamp >= (await this.currencyGovernance.revealEnds()))
    ) {
      await this.currencyGovernance.updateStage()
    }
  }

  async manageRandomInflation() {
    return this.null
  }

  async catchup() {
    // set up supervisor

    // these contracts only need be declared once, they are hosted on proxies
    this.timedPolicies = new ethers.Contract(
      await this.policy.policyFor(ID_TIMED_POLICIES),
      TimedPoliciesABI.abi,
      this.signer
    )
    console.log(`timedpolicies address is: ${this.timedPolicies.address}`)

    this.currencyTimer = new ethers.Contract(
      await this.policy.policyFor(ID_CURRENCY_TIMER),
      CurrencyTimerABI.abi,
      this.signer
    )
    console.log(`currencyTimer address is: ${this.currencyTimer.address}`)

    this.eco = new ethers.Contract(
      await this.policy.policyFor(ID_ECO),
      ECO.abi,
      this.signer
    )
    console.log(`ECO address is: ${this.eco.address}`)

    const filter = this.timedPolicies.filters.NewGeneration()
    const events = await this.timedPolicies.queryFilter(filter, 0, 'latest')
    const newGenerationEvent = events[events.length - 1]
    this.currentGeneration = newGenerationEvent.args[0]
    this.currentGenerationStartBlock = newGenerationEvent.blockNumber
    const block = await provider.getBlock(this.currentGenerationStartBlock)
    this.currentGenerationStartTime = block.timestamp
    this.GENERATION_TIME = await this.timedPolicies.GENERATION_DURATION()
    this.nextGenerationStartTime =
      this.currentGenerationStartTime + GENERATION_TIME

    console.log(
      `SUPERVISOR STARTED. CURRENT GENERATION STARTED AT TIME: ${this.currentGenerationStartTime} ON BLOCK: ${this.currentGenerationStartBlock}\n`
    )

    await this.updateContracts()

    await this.getTxHistory(0)
  }

  async getTxHistory() {
    return this.null
  }

  // async fetchContract(address, abi) {
  //   return new ethers.Contract(address, abi, this.signer);
  // }

  async processBlock() {
    const block = await provider.getBlock('latest')
    this.blockNumber = block.number
    this.timestamp = block.timestamp
    const drift = Math.abs(Math.floor(Date.now() / 1000) - this.timestamp)
    if (drift > 300) {
      // pretty primitive logging here, but it'll work for now
      const content = `current timestamp: ${Math.floor(
        Date.now() / 1000
      )}, block timestamp: ${this.timestamp}, drift: ${drift}`
      fs.writeFile('tools/timedrift.txt', content, (e) => {
        if (e) {
          console.log(e)
        }
      })
    }
    if (this.timestamp > this.nextGenerationStartTime) {
      console.log(
        `current time is ${this.timeStamp}, nextGenerationStart is ${this.nextGenerationStartTime}, updating generation`
      )
      await this.updateGeneration()
    } else if (this.currentGenerationStartBlock === this.blockNumber - 1) {
      console.log(
        `current generation block is ${this.currentGenerationStartBlock}, this.blockNumber is ${this.blockNumber}, updating contracts`
      )
      await this.updateContracts()
    } else {
      console.log('managing currency governance')
      await this.manageCurrencyGovernance()
      console.log('managing community governance')
      await this.manageCommunityGovernance()

      if (this.timestamp + REFUND_BUFFER > this.nextGenerationStart) {
        await this.refundUnselectedProposals()
      }

      if (this.randomInflation) {
        console.log('managing random inflation')
        await this.manageRandomInflation()
      }
    }
    console.log(`done with block ${this.blockNumber}`)
  }

  static async start(_jsonrpcProviderString, _rootPolicy) {
    provider = new ethers.providers.JsonRpcProvider(_jsonrpcProviderString)
    let signer = null
    if (_jsonrpcProviderString.includes('localhost')) {
      signer = await provider.getSigner()
    } else {
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
      signer = wallet.connect(provider)
    }

    const supervisor = await new Supervisor(_rootPolicy, signer)

    await supervisor.catchup()

    console.log('CAUGHT UP')

    provider.on('block', () => {
      supervisor.processBlock()
    })
  }
}

let args = fs.readFileSync('tools/supervisorInputs.txt')
args = args.toString().split('\n')
const rpc = args[0]
const rootPolicy = args[1]

console.log(rpc)
console.log(rootPolicy)

Supervisor.start(rpc, rootPolicy)

module.exports = {
  Supervisor,
}
