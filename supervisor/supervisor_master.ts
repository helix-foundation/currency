require('dotenv').config({path: '../.env'})
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// import { provider } from "@nomiclabs/hardhat-ethers"
import * as hre from "hardhat"
import * as ethers from "ethers";
// import { ethers } from "hardhat"
const fs = require('fs');
// const path = require('path');

import { TimeGovernor } from "./supervisor_timedPolicies"
// import { CurrencyGovernor } from "./supervisor_currencyGovernance"
// import { CommunityGovernor } from "./supervisor_communityGovernance"
import { Policy__factory, Policy, TimedPolicies__factory, TimedPolicies} from "../typechain-types"


let pk = process.env.PRIVATE_KEY || "";

const ID_TIMED_POLICIES = ethers.utils.solidityKeccak256(['string'], ['TimedPolicies'])

let provider: ethers.providers.BaseProvider

export async function startSupervisor (filepath: string) {
    let args = fs.readFileSync(filepath);
    args = args.toString().split('\n');
    let rpc: string = args[0];
    let root: string = args[1];
    provider = new ethers.providers.JsonRpcProvider(rpc);
    let supervisorWallet: ethers.Wallet = new ethers.Wallet(pk, provider);
    let rootPolicy: Policy = Policy__factory.connect(root, supervisorWallet);
    startModules(supervisorWallet, rootPolicy);

}

export async function testStartSupervisor(rootPolicy: Policy, account: SignerWithAddress) {
    // provider = new ethers.providers.JsonRpcProvider('http://localhost:8545')
    provider = hre.ethers.provider
    // console.log(provider);
    // console.log(provider);
    //is this right? 
    // let newAlice: ethers.Signer = account;
    // let supervisorWallet: ethers.Wallet = new ethers.Wallet('ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', provider);
    startModules(account, rootPolicy);

}

async function startModules(wallet: ethers.Signer, rootPolicy: Policy) {
    let timedPolicy: TimedPolicies = TimedPolicies__factory.connect(
        await rootPolicy.policyFor(ID_TIMED_POLICIES),
        wallet
    );
    // console.log(`supervisor timedPolicies is ${await timedPolicy.generation}`)
    let timeGovernor: TimeGovernor = new TimeGovernor(provider, wallet, rootPolicy, timedPolicy)
    timeGovernor.startTimer()
}

// startSupervisor()
