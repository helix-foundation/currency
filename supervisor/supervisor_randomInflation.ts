

import { Address } from "ethereumjs-util";
import * as ethers from "ethers";

import { Policy, TimedPolicies, CurrencyTimer, CurrencyTimer__factory, RandomInflation, RandomInflation__factory, InflationRootHashProposal, InflationRootHashProposal__factory, VDFVerifier, VDFVerifier__factory } from "../typechain-types"

const {
    getPrimal,
    getTree,
    answer,
  } = require('../tools/randomInflationUtils')

const { prove, bnHex } = require('../tools/vdf')

const ID_CURRENCY_TIMER = ethers.utils.solidityKeccak256(['string'], ['CurrencyTimer'])

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
    vdfSeed: string = ''
    vdfOutput!: ethers.Bytes


    constructor(provider: ethers.providers.BaseProvider, supervisorWallet: ethers.Signer, rootPolicy: Policy, timedPolicy: TimedPolicies) {
        this.provider = provider
        this.wallet = supervisorWallet
        this.policy = rootPolicy
        this.timedPolicy = timedPolicy
    };

    async setup() {
        this.currencyTimer = CurrencyTimer__factory.connect(await this.policy.policyFor(ID_CURRENCY_TIMER), this.wallet)
    }

    async inflationListener() {
        // make this better after you figure out how to do listeners
        this.currencyTimer.on("NewInflation", async (inflationAddr, _) => {
            this.randomInflation = await RandomInflation__factory.connect(inflationAddr, this.wallet)
            this.inflationRootHashProposal = InflationRootHashProposal__factory.connect(await this.randomInflation.inflationRootHashProposal(), this.wallet)
            this.vdfVerifier = VDFVerifier__factory.connect((await this.randomInflation.vdfVerifier()), this.wallet)
            await this.spawnListeners()
            await this.commitVdfSeed()

            // just started a generation with randomInflation, now what?
        })
    }

    async spawnListeners() {
        // flags once each finishes?
        this.randomInflation.once("EntropyVDFSeedCommit", async () => {
            await this.proveVDF()
        })
        this.vdfVerifier.once("SuccessfulVerification", async () => {
            await this.submitVDF()
        })
        this.randomInflation.once("EntropySeedReveal", async () => {
            // submit inflationRootHashProposal
        })
        let filter = this.inflationRootHashProposal.filters.RootHashChallengeIndexRequest(await this.wallet.getAddress())
        this.inflationRootHashProposal.on(filter, async (proposer, challenger, index) => {
            await this.respondToChallenge(challenger, index.toNumber())
        })
    }

    async commitVdfSeed() {
        const primalNumber: number = await getPrimal((await this.provider.getBlock("latest")).hash)
        tx = await this.randomInflation.setPrimal(primalNumber)
        rc = await tx.wait()
        if (rc.status) {
            tx = await this.randomInflation.commitEntropyVDFSeed(primalNumber)
            rc = await tx.wait()
            if (rc.status) {
                // done
                this.vdfSeed = (await this.randomInflation.entropyVDFSeed()).toString()
            } else {
                // failed to commit seed
            }
        } else {
            // failed setPrimal, try again
            setTimeout(this.commitVdfSeed.bind(this), 1000)
        }
    }

    async proveVDF() {
        // this.entropyVDFSeed = (await this.randomInflation.entropyVDFSeed()).toString()
        const difficulty: number = (await this.randomInflation.randomVDFDifficulty()).toNumber()
        const [y, Usqrt] = await prove(this.vdfSeed, difficulty)
        tx = await this.vdfVerifier.start(bnHex(this.vdfSeed), difficulty, bnHex(y))
        rc = await tx.wait()
        if (rc.status) {
            // successfully started
            try {
                for (let i = 0; i < difficulty; i++) {
                    const u = Usqrt[i]
                    tx = await this.vdfVerifier.update(bnHex(u))
                    rc = await tx.wait()
                    // emits SuccessfulVerification if successful
                }
                this.vdfOutput = y
            } catch (e) {
                // VDF failed verification
            }
        }
    }

    async submitVDF() {
        tx = await this.randomInflation.submitEntropyVDF(bnHex(this.vdfOutput))
        rc = await tx.wait()
        if (rc.status) {
            // done
            // emits EntropySeedReveal
        } else {
            // error
        }
    }

    async proposeRootHash() {
        let balances
        let totalSum!: number
        let numAccts!: number
        // get these from subgraphs
        // get addresses and balances into an array of elements [address, balance], sorted alphabetically by address, not case sensitive
        let AddressesToBalancesSorted
        const tree = await getTree(AddressesToBalancesSorted)
        tx = await this.inflationRootHashProposal.proposeRootHash(tree.hash, totalSum, numAccts)
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

    }


} 
