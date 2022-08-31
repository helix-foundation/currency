
import * as ethers from "ethers";

import { Policy, TimedPolicies, TimedPolicies__factory } from "./typechain-types"

const ID_TIMED_POLICIES = ethers.utils.solidityKeccak256(['string'], ['TimedPolicies'])

export class TimeGovernor {
    policy: Policy
    wallet: ethers.Wallet


    constructor(supervisorWallet: ethers.Wallet, rootPolicy: Policy) {
        this.policy = rootPolicy
        this.wallet = supervisorWallet

    };
} 