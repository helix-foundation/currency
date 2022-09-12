import * as ethers from "ethers";
import fetch from 'cross-fetch';
import { Policy, TimedPolicies, CurrencyTimer, CurrencyTimer__factory, RandomInflation, RandomInflation__factory, InflationRootHashProposal, InflationRootHashProposal__factory, VDFVerifier, VDFVerifier__factory } from "../typechain-types"
import { ApolloClient, InMemoryCache, HttpLink, gql } from '@apollo/client';
import { EcoSnapshotQueryResult, ECO_SNAPSHOT } from './ECO_SNAPSHOT'

const {
    getPrimal,
    getTree,
    answer,
  } = require('../tools/randomInflationUtils')

const { prove, bnHex } = require('../tools/vdf')

const SUBGRAPHS_URL = 'https://api.thegraph.com/subgraphs/name/paged1/policy'
const ID_CURRENCY_TIMER = ethers.utils.solidityKeccak256(['string'], ['CurrencyTimer'])
const DEFAULT_INFLATION_MULTIPLIER = ethers.BigNumber.from("1000000000000000000");

let tx
let rc

export class InflationGovernor {
    provider: ethers.providers.BaseProvider
    wallet: ethers.Signer
    policy: Policy
    timedPolicy: TimedPolicies
    currencyTimer!: CurrencyTimer
    randomInflation!: RandomInflation
    inflationRootHashProposal!: InflationRootHashProposal
    vdfVerifier!: VDFVerifier
    vdfSeed!: ethers.BigNumber
    vdfOutput!: ethers.Bytes
    tree: any


    constructor(provider: ethers.providers.BaseProvider, supervisorWallet: ethers.Signer, rootPolicy: Policy, timedPolicy: TimedPolicies) {
        this.provider = provider
        this.wallet = supervisorWallet
        this.policy = rootPolicy
        this.timedPolicy = timedPolicy
    };

    async setup() {
        this.currencyTimer = CurrencyTimer__factory.connect(await this.policy.policyFor(ID_CURRENCY_TIMER), this.wallet)
        await this.inflationListener()
    }

    async inflationListener() {
        // make this better after you figure out how to do listeners
        console.log('listening for new RI')
        this.currencyTimer.on("NewInflation", async (inflationAddr, _) => {
            console.log('new RI')
            this.randomInflation = await RandomInflation__factory.connect(inflationAddr, this.wallet)
            this.inflationRootHashProposal = InflationRootHashProposal__factory.connect(await this.randomInflation.inflationRootHashProposal(), this.wallet)
            this.vdfVerifier = VDFVerifier__factory.connect((await this.randomInflation.vdfVerifier()), this.wallet)
            await this.spawnListeners()
            this.commitVdfSeed()
            // this.proposeRootHash()

        })
    }

    async spawnListeners() {
        // flags once each finishes?
        this.randomInflation.once("EntropyVDFSeedCommit", async () => {
            await this.proveVDF()
        })
        this.vdfVerifier.once("SuccessfulVerification", async (_, __, output) => {
            await this.submitVDF(output)
        })
        // this.randomInflation.once("EntropySeedReveal", async () => {
        //     // submit inflationRootHashProposal
        // })
        let filter = this.inflationRootHashProposal.filters.RootHashChallengeIndexRequest(await this.wallet.getAddress())
        this.inflationRootHashProposal.on(filter, async (proposer, challenger, index) => {
            await this.respondToChallenge(challenger, index.toNumber())
        })
    }

    async commitVdfSeed() {
        console.log('trying to commit vdf seed')
        let primalNumber: number = 0
        try {
            primalNumber = await getPrimal((await this.provider.getBlock("latest")).hash)
            console.log('got primal')
        } catch (e) {
            console.log(e)
        }
        tx = await this.randomInflation.setPrimal(primalNumber)
        rc = await tx.wait()
        if (rc.status) {
            console.log('primal set')
            tx = await this.randomInflation.commitEntropyVDFSeed(primalNumber)
            rc = await tx.wait()
            if (rc.status) {
                // done
                this.vdfSeed = (await this.randomInflation.entropyVDFSeed())
                console.log(`committed vdf seed: ${this.vdfSeed}`)
            } else {
                console.log('failed to commit seed')
                // failed to commit seed
            }
        } else {
            // failed setPrimal, try again
            console.log('gligged on setPrimal')
            setTimeout(this.commitVdfSeed.bind(this), 1000)
        }
    }

    async proveVDF() {
        console.log('trying to prove vdf')
        // this.entropyVDFSeed = (await this.randomInflation.entropyVDFSeed()).toString()
        const difficulty: number = (await this.randomInflation.randomVDFDifficulty()).toNumber()
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
                this.vdfOutput = bnHex(y);
            } catch (e) {
                // VDF failed verification
                console.log('got schleeged on the vdf verification, brother')
                console.log(e)
                // console.log('failed vdf verification')
            }
        }
    }

    async submitVDF(output:ethers.ethers.utils.Bytes) {
        console.log('trying to submit vdf')
        // console.log(`vdf output is  ${this.vdfOutput}`)
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

    async proposeRootHash() {
        console.log('trying to propose roothash')
        let sortedBalances:[string, ethers.BigNumber][] = await this.fetchBalances((await this.randomInflation.blockNumber()).toNumber(), SUBGRAPHS_URL)

        let numAccts: number = sortedBalances.length
        let totalSum = ethers.BigNumber.from(0)
        for (const i of sortedBalances) {
            totalSum = totalSum.add(i[1])
        }
        // get these from subgraphs
        // get addresses and balances into an array of elements [address, balance], sorted alphabetically by address, not case sensitive

        this.tree = await getTree(sortedBalances)
        tx = await this.inflationRootHashProposal.proposeRootHash(this.tree.hash, totalSum, numAccts)
        rc = await tx.wait()
        if (rc.status) {
            // successfully proposed
        } else {
            // failed to propose
            // try again
            setTimeout(this.proposeRootHash.bind(this), 1000)
        } 
    }

    async respondToChallenge(challenger: string, index: number) {
        console.log(`trying to respond to RPH challenge by ${challenger} at index ${index}` )
        if(!this.tree) {
            this.tree = await getTree(await this.fetchBalances((await this.randomInflation.blockNumber()).toNumber(), SUBGRAPHS_URL))
        }
        const [node, pathToNode] = answer(this.tree, index)
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
            // successfully responded
        } else {
            // failed to respond
            // try again
            setTimeout(this.respondToChallenge.bind(this), 1000)
        }
    }

    async fetchBalances(block: number, subgraphUri: string) {
        console.log('fetching balances')
        const client = new ApolloClient({
            link: new HttpLink({uri: subgraphUri, fetch}),
            cache: new InMemoryCache(),
          });
        const { data: accountsSnapshotQuery } = await client.query<EcoSnapshotQueryResult>({query: ECO_SNAPSHOT, variables: {blockNumber: block}});
        return this.balanceInflationAdjustment(accountsSnapshotQuery) as [string, ethers.BigNumber][]

    }

    balanceInflationAdjustment(accountsSnapshotQuery: EcoSnapshotQueryResult) {
        if (accountsSnapshotQuery) {
            const inflationMultiplier = accountsSnapshotQuery.inflationMultipliers
            .length
            ? ethers.BigNumber.from(accountsSnapshotQuery.inflationMultipliers[0].value)
            : DEFAULT_INFLATION_MULTIPLIER;

            let balances: [string, ethers.BigNumber][] = accountsSnapshotQuery.accounts
            .map((account) => {
                const result: [string, ethers.BigNumber] = ["", ethers.BigNumber.from(0)];
                if (account.ECOBalances.length) {
                result[0] = account.address;
                result[1] = ethers.BigNumber.from(account.ECOBalances[0].value).div(
                    inflationMultiplier
                );
                }
                return result;
            })
            .filter((account) => !!account[0] && account[1].gt(0));
            return balances.sort((a, b) => { 
                return (a[0].toLowerCase()).localeCompare(b[0].toLowerCase(), 'en')
            })
        }
    }
} 
