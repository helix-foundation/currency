
import * as ethers from "ethers";

import { Policy, TimedPolicies, CurrencyGovernance__factory, CurrencyGovernance } from "../typechain-types"

const ID_CURRENCY_GOVERNANCE = ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])

export class CurrencyGovernor {
    provider: ethers.providers.BaseProvider
    wallet: ethers.Signer
    policy: Policy
    timedPolicy: TimedPolicies
    currencyGovernance: CurrencyGovernance
    triedUpdateStage: boolean = false
    triedCompute: boolean = false
    proposalEnds: number = 0
    votingEnds: number = 0
    revealEnds: number = 0
    stage: number = 0

    constructor(provider: ethers.providers.BaseProvider, supervisorWallet: ethers.Signer, rootPolicy: Policy, timedPolicy: TimedPolicies, currencyGovernance: CurrencyGovernance) {
        this.provider = provider
        this.policy = rootPolicy
        this.wallet = supervisorWallet
        this.timedPolicy = timedPolicy
        this.currencyGovernance = currencyGovernance
    };

    async setup() {
        this.proposalEnds = (await this.currencyGovernance.proposalEnds()).toNumber()
        this.votingEnds = (await this.currencyGovernance.votingEnds()).toNumber()
        this.revealEnds = (await this.currencyGovernance.revealEnds()).toNumber()
        this.stage = await this.currencyGovernance.currentStage()
    }

    async startListeners() {
        // this.provider.on("block", await this.stageUpdateListener)
        this.provider.on("block", async () => {
            await this.stageUpdateListener()
        })
        // this.timedPolicy.on("NewGeneration", this.newCurrencyGovernanceListener)
        this.timedPolicy.on("NewGeneration", async () => {
            await this.newCurrencyGovernanceListener()
        })
    }

    async stageUpdate() {
        try {
            // console.log(`updating from stage ${this.stage}`)
            this.triedUpdateStage = true
            let tx = await this.currencyGovernance.updateStage()
            let rc = await tx.wait()
            if (rc.status === 1) {
                this.triedUpdateStage = false
                this.stage = await this.currencyGovernance.currentStage()
                // console.log(this.stage)
            } else {
                console.log('ane')
                throw tx
            }
        } catch (e) {
            if (await this.currencyGovernance.currentStage() > this.stage) {
                // stage has already been updated
                this.triedUpdateStage = false
                this.stage = await this.currencyGovernance.currentStage()
            } else {
                // potential serious error
                setTimeout(this.stageUpdate.bind(this), 1000)
            }
        }
    }

    async doCompute() {
        try {
            this.triedCompute = true
            let tx = await this.currencyGovernance.compute()
            let rc = await tx.wait()
            if (rc.status === 1) {
                // console.log('computed')
                this.triedCompute = false
                this.stage = await this.currencyGovernance.currentStage()
            } else {
                throw tx
            }
        } catch (e) {
            if (await this.currencyGovernance.currentStage() > this.stage) {
                // stage has already been updated
                this.triedUpdateStage = false
                this.stage = await this.currencyGovernance.currentStage()
            } else {
                // potential serious error
                setTimeout(this.stageUpdate.bind(this), 1000)
            }
        }
    }

    async killListener(eventName:String) {
        if (eventName === "NewGeneration") {
            this.timedPolicy.off("NewGeneration", this.newCurrencyGovernanceListener)
        } else if (eventName === "block") {
            this.timedPolicy.off("block", this.stageUpdateListener)
        }
    }

    // listeners

    async stageUpdateListener() {
        let timestamp: number = (await this.provider.getBlock('latest')).timestamp
            if ((this.stage === 0 && timestamp > this.proposalEnds
                || this.stage === 1 && timestamp > this.votingEnds
                || this.stage === 2 && timestamp > this.revealEnds))
                {
                await this.stageUpdate()
            } else if (this.stage === 3) {
                this.doCompute()
            }
    }

    async newCurrencyGovernanceListener() {
        console.log('updating currencyGovernance')
        this.currencyGovernance = CurrencyGovernance__factory.connect(await this.policy.policyFor(ID_CURRENCY_GOVERNANCE), this.wallet)
        await this.setup()
    }
}