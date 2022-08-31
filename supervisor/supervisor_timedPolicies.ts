
import * as ethers from "ethers";
// import { ethers } from "hardhat";

import { Policy, TimedPolicies } from "../typechain-types"
import { hardhatArguments } from "hardhat";

export class TimeGovernor {
    policy: Policy
    wallet: ethers.Wallet
    timedPolicy: TimedPolicies
    nextGenStart: number = 0


    constructor(supervisorWallet: ethers.Wallet, rootPolicy: Policy, timedPolicy: TimedPolicies) {
        this.policy = rootPolicy
        this.wallet = supervisorWallet
        this.timedPolicy = timedPolicy
        
    };

    async startTimer() {
        console.log(`supervisor timedpolicy: ${this.timedPolicy.address}`)
        this.nextGenStart = (await this.timedPolicy.nextGenerationStart()).toNumber()
        let timeUntil: number = this.nextGenStart * 1000 - Date.now()
        setTimeout(this.genUpdate.bind(this), Math.max(timeUntil, 1))
    }

    // async intervalUpdater() {
        
    //     // for some reason cannot read field here
    //     // console.log(this.timedPolicy);
    //     let interval: number = (await this.timedPolicy.GENERATION_DURATION()).toNumber()
    //     setInterval(this.genUpdate.bind(this), interval*1000)
    //     // make some way to stop this if necessary
    // }

    async genUpdate() {
        try {
            let tx = await this.timedPolicy.incrementGeneration()
            let rc = await tx.wait()
            if (rc.status === 1) {
                this.startTimer()
                console.log('updated')
            } else {
                throw tx
            }
        } catch (e) {
            if ((await this.timedPolicy.nextGenerationStart()).toNumber() > this.nextGenStart) {
                //generation has been updated
                this.nextGenStart = (await this.timedPolicy.nextGenerationStart()).toNumber()
            } else {
                setTimeout(this.genUpdate.bind(this), 1000)
            }
        }
        
    }

}