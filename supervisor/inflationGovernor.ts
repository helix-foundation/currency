/* eslint-disable camelcase */
/* eslint-disable no-unused-vars */
import * as ethers from 'ethers'
import fetch from 'cross-fetch'
import {
  Policy,
  TimedPolicies,
  TimedPolicies__factory,
  CurrencyTimer,
  CurrencyTimer__factory,
  RandomInflation,
  RandomInflation__factory,
  InflationRootHashProposal,
  InflationRootHashProposal__factory,
  VDFVerifier,
  VDFVerifier__factory,
  ECO__factory,
  ECO,
} from '../typechain-types'
import { ApolloClient, InMemoryCache, HttpLink } from '@apollo/client'
import { EcoSnapshotQueryResult, ECO_SNAPSHOT } from './ECO_SNAPSHOT'
import { logError, SupervisorError } from './logError'
import { fetchLatestBlock } from './tools'

const { getPrimal, getTree, answer } = require('../tools/randomInflationUtils')

const { prove, bnHex } = require('../tools/vdf')

const ID_TIMED_POLICIES = ethers.utils.solidityKeccak256(
  ['string'],
  ['TimedPolicies']
)
const ID_CURRENCY_TIMER = ethers.utils.solidityKeccak256(
  ['string'],
  ['CurrencyTimer']
)
const ID_ECO = ethers.utils.solidityKeccak256(['string'], ['ECO'])
const DEFAULT_INFLATION_MULTIPLIER = ethers.BigNumber.from(
  '1000000000000000000'
)

const BLACKLIST = [
  ethers.constants.AddressZero,
  '0x98830c37aa6abdae028bea5c587852c569092d71', // Eco Association
  '0xa201d3c815ac9d4d8830fb3de2b490b5b0069aca', // Eco Inc.
  '0x99f98ea4a883db4692fa317070f4ad2dc94b05ce', // Eco Association
  '0xab86356eDbba19D35f63712dB5CDb5E1b05F1e08', // Testnet Pool
  '0x09bc52b9eb7387ede639fc10ce5fa01cbcbf2b17', // Mainnet ECO~USDC Pool

  // policy address pushed during construction
]

const newInflationEvent = 'NewInflation'
const entropyVDFSeedCommitEvent = 'EntropyVDFSeedCommit'
const successfulVerificationEvent = 'SuccessfulVerification'
const rootHashPostEvent = 'RootHashPost'
const rootHashChallengeIndexRequestEvent = 'RootHashChallengeIndexRequest'
// const rootHashAcceptanceEvent = 'RootHashAcceptance'

let tx
let rc

let testMap: [string, ethers.BigNumber][] = [
  [
    '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    ethers.BigNumber.from('50000000000000000000000000'),
  ],
  [
    '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    ethers.BigNumber.from('100000000000000000000000000'),
  ],
  [
    '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    ethers.BigNumber.from('150000000000000000000000000'),
  ],
]

export class InflationGovernor {
  provider: ethers.providers.BaseProvider
  subgraphsUrl: string
  wallet: ethers.Signer
  policy: Policy
  timedPolicy!: TimedPolicies
  currencyTimer!: CurrencyTimer
  eco!: ECO
  randomInflation!: RandomInflation
  inflationRootHashProposal!: InflationRootHashProposal
  newChallengerSubmissionEnds!: number
  lastLiveChallenge!: number
  vdfVerifier!: VDFVerifier
  vdfSeed!: ethers.BigNumber
  vdfOutput!: ethers.Bytes
  production: boolean

  tree: any

  constructor(
    provider: ethers.providers.BaseProvider,
    supervisorWallet: ethers.Signer,
    rootPolicy: Policy,
    subgraphsUrl: string,
    production: boolean
  ) {
    this.provider = provider
    this.wallet = supervisorWallet
    this.policy = rootPolicy
    this.subgraphsUrl = subgraphsUrl
    this.production = production
    BLACKLIST.push(this.policy.address)
  }

  async setup() {
    this.timedPolicy = TimedPolicies__factory.connect(
      await this.policy.policyFor(ID_TIMED_POLICIES),
      this.wallet
    )
    this.currencyTimer = CurrencyTimer__factory.connect(
      await this.policy.policyFor(ID_CURRENCY_TIMER),
      this.wallet
    )
    this.eco = ECO__factory.connect(
      await this.policy.policyFor(ID_ECO),
      this.wallet
    )
  }

  async startListeners() {
    // make this better after you figure out how to do listeners
    console.log('listening for new RI')
    this.currencyTimer.on(newInflationEvent, async (inflationAddr, _) => {
      console.log('new RI')
      this.startRIProcesses(inflationAddr)
    })
    this.provider.on('block', this.checkRootHashStatus.bind(this))
  }

  async startRIProcesses(inflationAddr: string) {
    this.randomInflation = await RandomInflation__factory.connect(
      inflationAddr,
      this.wallet
    )
    this.inflationRootHashProposal = InflationRootHashProposal__factory.connect(
      await this.randomInflation.inflationRootHashProposal(),
      this.wallet
    )
    this.vdfVerifier = VDFVerifier__factory.connect(
      await this.randomInflation.vdfVerifier(),
      this.wallet
    )
    this.newChallengerSubmissionEnds = 0
    this.lastLiveChallenge = 0
    await this.startRIInstanceListeners()
    if (!this.production) {
      // this is the same minting as exists in the test suite, so can defend root hash proposals
      testMap = testMap.sort((a, b) => {
        return a[0].toLowerCase().localeCompare(b[0].toLowerCase(), 'en')
      })
      this.proposeRootHash(testMap)
    } else {
      this.proposeRootHash(
        await this.fetchBalances(
          (await this.randomInflation.blockNumber()).toNumber(),
          this.subgraphsUrl
        )
      )
    }
  }

  async startRIInstanceListeners() {
    // flags once each finishes?
    this.randomInflation.once(entropyVDFSeedCommitEvent, async () => {
      await this.proveVDF()
    })
    this.vdfVerifier.once(
      successfulVerificationEvent,
      async (_, __, output) => {
        await this.submitVDF(output)
      }
    )
    const filter =
      this.inflationRootHashProposal.filters.RootHashChallengeIndexRequest(
        await this.wallet.getAddress()
      )
    this.inflationRootHashProposal.on(filter, async (_, challenger, index) => {
      console.log(index)
      await this.respondToChallenge(challenger, index.toNumber())
    })
    this.inflationRootHashProposal.once(rootHashPostEvent, async () => {
      console.log("well gents, looks like it's PRIMIN' TIME")
      await this.commitVdfSeed()
    })
  }

  async killListeners() {
    if (this.randomInflation) {
      await this.randomInflation.removeAllListeners(entropyVDFSeedCommitEvent)
    }
    if (this.vdfVerifier) {
      await this.vdfVerifier.removeAllListeners(successfulVerificationEvent)
    }
    await this.currencyTimer.removeAllListeners(newInflationEvent)
  }

  async commitVdfSeed(): Promise<void> {
    console.log('trying to commit vdf seed')

    let primalNumber: number = 0
    primalNumber = await getPrimal((await fetchLatestBlock(this.provider)).hash)
    console.log('got primal')
    try {
      tx = await this.randomInflation.setPrimal(primalNumber)
      rc = await tx.wait()
      if (rc.status) {
        console.log('primal set')
        tx = await this.randomInflation.commitEntropyVDFSeed(primalNumber)
        rc = await tx.wait()
        if (rc.status) {
          // done
          this.vdfSeed = await this.randomInflation.entropyVDFSeed()
          console.log(`committed vdf seed: ${this.vdfSeed}`)
        }
      }
    } catch (e) {
      // error logging
      console.log('failed setPrimal, trying again')
      console.log((await fetchLatestBlock(this.provider)).number)
      return await this.commitVdfSeed()
    }
  }

  async proveVDF() {
    console.log('trying to prove vdf')
    try {
      // this.entropyVDFSeed = (await this.randomInflation.entropyVDFSeed()).toString()
      const difficulty: number = (
        await this.randomInflation.randomVDFDifficulty()
      ).toNumber()
      const [y, Usqrt] = prove(this.vdfSeed, difficulty)
      tx = await this.vdfVerifier.start(
        bnHex(this.vdfSeed),
        difficulty,
        bnHex(y)
      )
      rc = await tx.wait()
      if (rc.status) {
        // successfully started
        try {
          for (let i = 0; i < difficulty - 1; i++) {
            const u = Usqrt[i]
            tx = await this.vdfVerifier.update(bnHex(u))
            rc = await tx.wait()
            // emits SuccessfulVerification if successful
          }
          this.vdfOutput = bnHex(y)
        } catch (e) {
          // error logging
          logError({
            type: SupervisorError.VerifyVDF,
            error: e,
          })
          console.log('failed vdfVerification')
          // have to start again from setPrimal
        }
      }
    } catch (e) {
      // error logging
      logError({
        type: SupervisorError.StartVDF,
        error: e,
      })
    }
  }

  async submitVDF(output: ethers.ethers.utils.Bytes) {
    console.log('trying to submit vdf')
    try {
      tx = await this.randomInflation.submitEntropyVDF(output)
      rc = await tx.wait()
      if (rc.status) {
        // done
        // emits EntropySeedReveal
        console.log('submitted vdf')
      }
    } catch (e) {
      // error logging
      logError({
        type: SupervisorError.SubmitVDF,
        error: e,
      })
    }
  }

  async proposeRootHash(sortedBalances: [string, ethers.BigNumber][]) {
    console.log('trying to propose roothash')
    const numAccts: number = sortedBalances.length
    let totalSum = ethers.BigNumber.from(0)
    for (const i of sortedBalances) {
      totalSum = totalSum.add(i[1])
    }

    this.tree = await getTree(sortedBalances)

    try {
      tx = await this.eco.approve(
        this.inflationRootHashProposal.address,
        await this.inflationRootHashProposal.PROPOSER_FEE()
      )
      rc = await tx.wait()
    } catch (e) {
      // error logging
      logError({
        type: SupervisorError.ApproveInflationFee,
        error: e,
      })
    }

    // check the supervisor's eco balance
    this.checkEcoBalance()

    try {
      tx = await this.inflationRootHashProposal.proposeRootHash(
        this.tree.hash,
        totalSum,
        numAccts
      )
      rc = await tx.wait()
      if (rc.status) {
        // successfully proposed
        console.log('proposed roothash')
        const rhp = await this.inflationRootHashProposal.rootHashProposals(
          await this.wallet.getAddress()
        )
        this.newChallengerSubmissionEnds =
          rhp.newChallengerSubmissionEnds.toNumber()
        this.lastLiveChallenge = rhp.lastLiveChallenge.toNumber()
      }
    } catch (e) {
      // error logging
      logError({
        type: SupervisorError.ProposeRootHash,
        error: e,
      })
      // proposing the root hash failed
      setTimeout(this.proposeRootHash.bind(this), 1000)
    }
  }

  async checkEcoBalance() {
    try {
      // check eco balance
      // log error if balance is less than 2x the proposer fee
      const balance = await this.eco.balanceOf(await this.wallet.getAddress())
      const proposerFee = await this.inflationRootHashProposal.PROPOSER_FEE()
      if (balance.lt(proposerFee.mul(2))) {
        logError({
          type: SupervisorError.LowEcoBalance,
          context: `Supervisor Balance: ${ethers.utils.formatUnits(
            balance
          )} ECO, inflation proposer fee is ${ethers.utils.formatUnits(
            proposerFee
          )}`,
        })
      }
    } catch (err) {
      console.log(err)
    }
  }

  async respondToChallenge(challenger: string, index: number) {
    const rhp = await this.inflationRootHashProposal.rootHashProposals(
      await this.wallet.getAddress()
    )
    this.lastLiveChallenge = rhp.lastLiveChallenge.toNumber()
    console.log(
      `trying to respond to RHP challenge by ${challenger} at index ${index}`
    )
    if (!this.tree) {
      this.tree = await getTree(
        await this.fetchBalances(
          (await this.randomInflation.blockNumber()).toNumber(),
          this.subgraphsUrl
        )
      )
    }
    const [node, pathToNode] = answer(this.tree, index)
    try {
      tx = await this.inflationRootHashProposal.respondToChallenge(
        challenger,
        pathToNode.reverse(),
        node.account,
        node.balance,
        node.sum,
        index
      )
      rc = await tx.wait()
      if (rc.status) {
        console.log('responded!')
      }
    } catch (e) {
      // error logging
      logError({
        type: SupervisorError.RespondToChallenge,
        error: e,
      })
      await this.respondToChallenge(challenger, index)
    }
  }

  async checkRootHashStatus() {
    if (this.newChallengerSubmissionEnds > 0) {
      const block = await fetchLatestBlock(this.provider)
      if (
        block.timestamp > this.newChallengerSubmissionEnds &&
        block.timestamp > this.lastLiveChallenge
      ) {
        const supervisorAddress: string = await this.wallet.getAddress()
        try {
          tx = await this.inflationRootHashProposal.checkRootHashStatus(
            supervisorAddress
          )
          rc = await tx.wait()
          if (
            (await this.inflationRootHashProposal.acceptedRootHash()) !==
            ethers.constants.HashZero
          ) {
            // root hash is accepted
            // agnostic of if it was the supervisor's or someone elses
            this.newChallengerSubmissionEnds = 0
            this.lastLiveChallenge = 0
            // stop listening for challenges
            await this.inflationRootHashProposal.removeAllListeners(
              rootHashChallengeIndexRequestEvent
            )
            console.log(
              `root hash accepted: ${await this.inflationRootHashProposal.acceptedRootHash()}`
            )
          } else {
            // error: supervisor expected root hash proposal to have been accepted but it wasnt.
            // regardless of other activity, supervisor's rhp should have been accepted by now.
            const rhp = await this.inflationRootHashProposal.rootHashProposals(
              supervisorAddress
            )
            console.log(`expected status = 2, got ${rhp.status}`)
          }
        } catch (e) {
          // error logging
          logError({
            type: SupervisorError.CheckRootHashStatus,
            error: e,
          })
        }
      }
    }
  }

  async fetchBalances(block: number, subgraphUri: string) {
    console.log('fetching balances')
    const client = new ApolloClient({
      link: new HttpLink({ uri: subgraphUri, fetch }),
      cache: new InMemoryCache(),
    })
    const { data: accountsSnapshotQuery } =
      await client.query<EcoSnapshotQueryResult>({
        query: ECO_SNAPSHOT,
        variables: { blockNumber: block },
      })

    const adjustedBalances = this.balanceInflationAdjustment(
      accountsSnapshotQuery
    ) as [string, ethers.BigNumber][]

    return adjustedBalances.filter((account) => !BLACKLIST.includes(account[0]))
  }

  balanceInflationAdjustment(accountsSnapshotQuery: EcoSnapshotQueryResult) {
    if (accountsSnapshotQuery) {
      const inflationMultiplier = accountsSnapshotQuery.inflationMultipliers
        .length
        ? ethers.BigNumber.from(
            accountsSnapshotQuery.inflationMultipliers[0].value
          )
        : DEFAULT_INFLATION_MULTIPLIER

      const balances: [string, ethers.BigNumber][] =
        accountsSnapshotQuery.accounts
          .map((account) => {
            const result: [string, ethers.BigNumber] = [
              '',
              ethers.BigNumber.from(0),
            ]
            if (account.ECOVotingPowers.length) {
              result[0] = account.address
              result[1] = ethers.BigNumber.from(
                account.ECOVotingPowers[0].value
              ).div(inflationMultiplier)
            }
            return result
          })
          .filter((account) => !!account[0] && account[1].gt(0))
      return balances.sort((a, b) => {
        return a[0].toLowerCase().localeCompare(b[0].toLowerCase(), 'en')
      })
    }
  }
}
