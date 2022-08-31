
import * as ethers from "ethers";

import { Policy, TimedPolicies, PolicyProposals, PolicyProposals__factory, PolicyVotes, PolicyVotes__factory } from "../typechain-types"

const ID_POLICY_PROPOSALS = ethers.utils.solidityKeccak256(['string'], ['PolicyVotes'])
const ID_POLICY_VOTES = ethers.utils.solidityKeccak256(['string'], ['PolicyVotes'])


let policyProposals: PolicyProposals
let policyVotes: PolicyVotes

export class CommunityGovernor {
    policy: Policy
    wallet: ethers.Wallet
    timedPolicy: TimedPolicies


    constructor(supervisorWallet: ethers.Wallet, rootPolicy: Policy, timedPolicy: TimedPolicies) {
        this.policy = rootPolicy
        this.wallet = supervisorWallet
        this.timedPolicy = timedPolicy
    };

    async generationListener() {
        this.timedPolicy.on("NewGeneration", async () => {
            policyProposals = PolicyProposals__factory.connect(await this.policy.policyFor(ID_POLICY_PROPOSALS), this.wallet)
        })
    }



}