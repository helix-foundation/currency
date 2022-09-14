/* eslint-disable camelcase */
import * as ethers from 'ethers'
import fetch from 'cross-fetch'
import {
  Policy,
  TimedPolicies,
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

const { getPrimal, getTree, answer } = require('../tools/randomInflationUtils')

const { prove, bnHex } = require('../tools/vdf')

const SUBGRAPHS_URL = 'https://api.thegraph.com/subgraphs/name/paged1/policy'
const ID_CURRENCY_TIMER = ethers.utils.solidityKeccak256(
  ['string'],
  ['CurrencyTimer']
)
const ID_ECO = ethers.utils.solidityKeccak256(['string'], ['ECO'])
const DEFAULT_INFLATION_MULTIPLIER = ethers.BigNumber.from(
  '1000000000000000000'
)

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
  wallet: ethers.Signer
  policy: Policy
  timedPolicy: TimedPolicies
  currencyTimer!: CurrencyTimer
  eco!: ECO
  randomInflation!: RandomInflation
  inflationRootHashProposal!: InflationRootHashProposal
  vdfVerifier!: VDFVerifier
  vdfSeed!: ethers.BigNumber
  vdfOutput!: ethers.Bytes
  production: boolean

  tree: any

  constructor(
    provider: ethers.providers.BaseProvider,
    supervisorWallet: ethers.Signer,
    rootPolicy: Policy,
    timedPolicy: TimedPolicies,
    production: boolean
  ) {
    this.provider = provider
    this.wallet = supervisorWallet
    this.policy = rootPolicy
    this.timedPolicy = timedPolicy
    this.production = production
  }

  async setup() {
    this.currencyTimer = CurrencyTimer__factory.connect(
      await this.policy.policyFor(ID_CURRENCY_TIMER),
      this.wallet
    )
    await this.inflationListener()
  }

  async inflationListener() {
    // make this better after you figure out how to do listeners
    console.log('listening for new RI')
    this.currencyTimer.on('NewInflation', async (inflationAddr, _) => {
      console.log('new RI')
      this.randomInflation = await RandomInflation__factory.connect(
        inflationAddr,
        this.wallet
      )
      this.inflationRootHashProposal =
        InflationRootHashProposal__factory.connect(
          await this.randomInflation.inflationRootHashProposal(),
          this.wallet
        )
      this.vdfVerifier = VDFVerifier__factory.connect(
        await this.randomInflation.vdfVerifier(),
        this.wallet
      )
      this.eco = ECO__factory.connect(
        await this.policy.policyFor(ID_ECO),
        this.wallet
      )
      await this.spawnListeners()
      this.commitVdfSeed()
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
            SUBGRAPHS_URL
          )
        )
      }
    })
  }

  async spawnListeners() {
    // flags once each finishes?
    this.randomInflation.once('EntropyVDFSeedCommit', async () => {
      await this.proveVDF()
    })
    this.vdfVerifier.once('SuccessfulVerification', async (_, __, output) => {
      await this.submitVDF(output)
    })
    const filter =
      this.inflationRootHashProposal.filters.RootHashChallengeIndexRequest(
        await this.wallet.getAddress()
      )
    this.inflationRootHashProposal.on(
      filter,
      async (proposer, challenger, index) => {
        await this.respondToChallenge(challenger, index.toNumber())
      }
    )
  }

  async killListeners() {
    this.randomInflation.removeAllListeners('EntropyVDFSeedCommit')
    this.vdfVerifier.removeAllListeners('SuccessfulVerification')
    this.currencyTimer.removeAllListeners('NewInflation')
  }

  async commitVdfSeed() {
    console.log('trying to commit vdf seed')
    let primalNumber: number = 0
    primalNumber = await getPrimal(
      (
        await this.provider.getBlock('latest')
      ).hash
    )
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
        } else {
          // shouldnt happen
          console.log('failed to commit seed')
        }
      } else {
        // failed setPrimal
      }
    } catch (e) {
      // error logging
      // this gets hit a lot due to setPrimal being kind of finnicky
      console.log('failed setPrimal, trying again')
      setTimeout(this.commitVdfSeed.bind(this), 1000)
    }
  }

  async proveVDF() {
    console.log('trying to prove vdf')
    // this.entropyVDFSeed = (await this.randomInflation.entropyVDFSeed()).toString()
    const difficulty: number = (
      await this.randomInflation.randomVDFDifficulty()
    ).toNumber()
    const [y, Usqrt] = await prove(this.vdfSeed, difficulty)
    tx = await this.vdfVerifier.start(bnHex(this.vdfSeed), difficulty, bnHex(y))
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
        console.log(e)
        // error logging
        console.log('failed vdfVerification')
        // have to start again from setPrimal
      }
    }
  }

  async submitVDF(output: ethers.ethers.utils.Bytes) {
    console.log('trying to submit vdf')
    tx = await this.randomInflation.submitEntropyVDF(output)
    rc = await tx.wait()
    if (rc.status) {
      // done
      // emits EntropySeedReveal
      console.log('submitted vdf')
    } else {
      console.log('failed to submit vdf')
      // no reason why this would happen
      throw tx
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

    await this.eco.approve(
      this.inflationRootHashProposal.address,
      await this.inflationRootHashProposal.PROPOSER_FEE()
    )

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
      } else {
        // shouldn't happen
        console.log('failed to propose')
      }
    } catch (e) {
      // error logging
      console.log(e)
      setTimeout(this.proposeRootHash.bind(this), 1000)
    }
  }

  async respondToChallenge(challenger: string, index: number) {
    console.log(
      `trying to respond to RPH challenge by ${challenger} at index ${index}`
    )
    if (!this.tree) {
      this.tree = await getTree(
        await this.fetchBalances(
          (await this.randomInflation.blockNumber()).toNumber(),
          SUBGRAPHS_URL
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
      } else {
        // shouldnt happen
        console.log('failed to respond to challenge')
      }
    } catch (e) {
      // error logging
      console.log(e)
      // this one gets hit (in hh) when multiple challenges come in during the same block
      setTimeout(this.respondToChallenge.bind(this, challenger, index), 1000)
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
    return this.balanceInflationAdjustment(accountsSnapshotQuery) as [
      string,
      ethers.BigNumber
    ][]
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
            if (account.ECOBalances.length) {
              result[0] = account.address
              result[1] = ethers.BigNumber.from(
                account.ECOBalances[0].value
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
