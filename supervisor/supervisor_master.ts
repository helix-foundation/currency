require('dotenv').config({path: '../.env'})
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import * as ethers from "ethers";
const fs = require('fs');
// const path = require('path');

import { TimeGovernor } from "./supervisor_timedPolicies"
// import { CurrencyGovernor } from "./supervisor_currencyGovernance"
// import { CommunityGovernor } from "./supervisor_communityGovernance"
import { Policy__factory, Policy, TimedPolicies__factory, TimedPolicies} from "../typechain-types"


let pk = process.env.PRIVATE_KEY || "";

const ID_TIMED_POLICIES = ethers.utils.solidityKeccak256(['string'], ['TimedPolicies'])

async function startSupervisor () {
    let args = fs.readFileSync("liveConfig.txt");
    args = args.toString().split('\n');
    let rpc: string = args[0];
    let root: string = args[1];
    let provider = new ethers.providers.JsonRpcProvider(rpc);
    let supervisorWallet: ethers.Wallet = new ethers.Wallet(pk, provider);
    let rootPolicy: Policy = Policy__factory.connect(root, supervisorWallet);
    startModules(supervisorWallet, rootPolicy);

}

export async function testStartSupervisor(rootPolicy: Policy) {
    let provider = ethers.providers.getDefaultProvider()
    //is this right? 
    let supervisorWallet: ethers.Wallet = new ethers.Wallet(pk, provider);
    startModules(supervisorWallet, rootPolicy);

}

async function startModules(wallet: ethers.Wallet, rootPolicy: Policy) {
    let timedPolicy: TimedPolicies = TimedPolicies__factory.connect(
        await rootPolicy.policyFor(ID_TIMED_POLICIES),
        wallet
    );
    // console.log(`supervisor timedPolicies is ${await timedPolicy.generation}`)
    let timeGovernor: TimeGovernor = new TimeGovernor(wallet, rootPolicy, timedPolicy)
    timeGovernor.startTimer()
}

// startSupervisor()
