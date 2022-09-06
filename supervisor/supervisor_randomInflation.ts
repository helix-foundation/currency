

import * as ethers from "ethers";

import { CurrencyGovernance, Policy, TimedPolicies, CurrencyGovernance__factory} from "../typechain-types"

const ID_TIMED_POLICIES = ethers.utils.solidityKeccak256(['string'], ['TimedPolicies'])

export class InflationGovernor {
    provider: ethers.providers.BaseProvider
    wallet: ethers.Signer
    policy: Policy
    timedPolicy: TimedPolicies
    currencyGovernance: CurrencyGovernance
    nextGenStart: number = 0
    triedUpdate: Boolean = false


    constructor(supervisorWallet: ethers.Wallet, rootPolicy: Policy) {
        this.policy = rootPolicy
        this.wallet = supervisorWallet
    };

    async generationListener() {
        this.timedPolicy.on("NewGeneration", async () => {
            this.currencyGovernance = CurrencyGovernance__factory.connect(await this.policy.policyFor(ID_CURRENCY_GOVERNANCE), this.wallet)
            
        })
    }
} 