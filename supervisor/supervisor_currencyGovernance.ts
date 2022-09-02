
import * as ethers from "ethers";

import { Policy, TimedPolicies, CurrencyGovernance__factory, CurrencyGovernance } from "../typechain-types"

const ID_CURRENCY_GOVERNANCE = ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])


let proposalEnds: number
let votingEnds: number
let revealEnds: number
let stage: number

export class CurrencyGovernor {
    provider: ethers.providers.BaseProvider
    wallet: ethers.Signer
    policy: Policy
    timedPolicy: TimedPolicies
    currencyGovernance: CurrencyGovernance
    triedUpdateStage: boolean = false
    triedCompute: boolean = false

    constructor(provider: ethers.providers.BaseProvider, supervisorWallet: ethers.Signer, rootPolicy: Policy, timedPolicy: TimedPolicies, currencyGovernance: CurrencyGovernance) {
        this.provider = provider
        this.policy = rootPolicy
        this.wallet = supervisorWallet
        this.timedPolicy = timedPolicy
        this.currencyGovernance = currencyGovernance
    };

    async setup() {
        proposalEnds = (await this.currencyGovernance.proposalEnds()).toNumber()
        votingEnds = (await this.currencyGovernance.votingEnds()).toNumber()
        revealEnds = (await this.currencyGovernance.revealEnds()).toNumber()
        stage = await this.currencyGovernance.currentStage()
    }

    async startTimer() {
        this.provider.on("block" , async () => {
            let timestamp: number = (await this.provider.getBlock('latest')).timestamp
            if ((stage === 0 && timestamp > proposalEnds
                || stage === 1 && timestamp > votingEnds
                || stage === 2 && timestamp > revealEnds))
                {
                await this.stageUpdate()
            } else if (stage === 3) {
                this.doCompute()
            }
        })
    }

    async stageUpdate() {
        try {
            this.triedUpdateStage = true
            let tx = await this.currencyGovernance.updateStage()
            let rc = await tx.wait()
            if (rc.status === 1) {
                this.triedUpdateStage = false
                stage++
            } else {
                throw tx
            }
        } catch (e) {
            if (await this.currencyGovernance.currentStage() > stage) {
                // stage has already been updated
                this.triedUpdateStage = false
                stage++
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
                this.triedCompute = false
                stage++
            } else {
                throw tx
            }
        } catch (e) {
            if (await this.currencyGovernance.currentStage() > stage) {
                // stage has already been updated
                this.triedUpdateStage = false
                stage++
            } else {
                // potential serious error
                setTimeout(this.stageUpdate.bind(this), 1000)
            }
        }
    }

    async generationListener() {
        this.timedPolicy.on("NewGeneration", async () => {
            this.currencyGovernance = CurrencyGovernance__factory.connect(await this.policy.policyFor(ID_CURRENCY_GOVERNANCE), this.wallet)
            await this.setup()
        })
    }
}