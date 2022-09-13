
import * as ethers from "ethers";

import { Policy, TimedPolicies } from "../typechain-types"

export class TimeGovernor {
    provider: ethers.providers.BaseProvider
    wallet: ethers.Signer
    policy: Policy
    timedPolicy: TimedPolicies
    nextGenStart: number = 0
    triedUpdate: Boolean = false
    generation: number = 0


    constructor(provider: ethers.providers.BaseProvider, supervisorWallet: ethers.Signer, rootPolicy: Policy, timedPolicy: TimedPolicies) {
        this.provider = provider
        this.policy = rootPolicy
        this.wallet = supervisorWallet
        this.timedPolicy = timedPolicy
        
    };

    async startTimer() {
        this.nextGenStart = (await this.timedPolicy.nextGenerationStart()).toNumber()
        this.generation = (await this.timedPolicy.generation()).toNumber()
        this.provider.on("block" , async () => {
            this.callUpdateOnBlock()
        })
        // this.provider.on("block" , this.callUpdateOnBlock)
    }

    async callUpdateOnBlock() {
        let block = await this.provider.getBlock('latest')
        // console.log(block.number)
        if (block.timestamp > this.nextGenStart && !this.triedUpdate) {
            this.genUpdate()
        }
    }

    async genUpdate() {
        try {
            this.triedUpdate = true;
            let tx = await this.timedPolicy.incrementGeneration()
            let rc = await tx.wait()
            if (rc.status === 1) {
                this.triedUpdate = false
                this.nextGenStart = (await this.timedPolicy.nextGenerationStart()).toNumber()
                this.generation += 1
                console.log(`generation incremented to ${this.generation}`)
            } else {
                throw tx
            }
        } catch (e) {
            if ((await this.timedPolicy.nextGenerationStart()).toNumber() > this.nextGenStart) {
                //generation has been updated
                this.triedUpdate = false
                this.nextGenStart = (await this.timedPolicy.nextGenerationStart()).toNumber()
            } else {
                // potential serious error
                setTimeout(this.genUpdate.bind(this), 1000)
            }
        }

    }

    async killListener() {
        // this.provider.off("block", this.callUpdateOnBlock)
        this.provider.removeAllListeners("block")
    }

}