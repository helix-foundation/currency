require('dotenv').config({path: '../.env'})
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// import { provider } from "@nomiclabs/hardhat-ethers"
import * as hre from "hardhat"
import * as ethers from "ethers";
// import { ethers } from "hardhat"
const fs = require('fs');
// const path = require('path');

import { TimeGovernor } from "./supervisor_timedPolicies"
import { CurrencyGovernor }from "./supervisor_currencyGovernance"
// import { CurrencyGovernor } from "./supervisor_currencyGovernance"
// import { CommunityGovernor } from "./supervisor_communityGovernance"
import { Policy__factory, Policy, TimedPolicies__factory, TimedPolicies, CurrencyGovernance__factory, CurrencyGovernance } from "../typechain-types"
// import { CurrencyGovernance } from "../typechain-types/CurrencyGovernance";


let pk = process.env.PRIVATE_KEY || "";

const ID_TIMED_POLICIES = ethers.utils.solidityKeccak256(['string'], ['TimedPolicies'])
const ID_CURRENCY_GOVERNANCE = ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])

let provider: ethers.providers.BaseProvider

export class Supervisor {
    timeGovernor!: TimeGovernor
    currencyGovernor!: CurrencyGovernor



    constructor () {
        
    }


    async startSupervisor (filepath: string) {
        let args = fs.readFileSync(filepath);
        args = args.toString().split('\n');
        let rpc: string = args[0];
        let root: string = args[1];
        provider = new ethers.providers.JsonRpcProvider(rpc);
        let supervisorWallet: ethers.Wallet = new ethers.Wallet(pk, provider);
        let rootPolicy: Policy = Policy__factory.connect(root, supervisorWallet);
        this.startModules(supervisorWallet, rootPolicy);
    
    }
    
    async testStartSupervisor(rootPolicy: Policy, account: SignerWithAddress) {
        provider = hre.ethers.provider
        return this.startModules(account, rootPolicy);
    }
    
    async startModules(wallet: ethers.Signer, rootPolicy: Policy) {
        let timedPolicy: TimedPolicies = TimedPolicies__factory.connect(
            await rootPolicy.policyFor(ID_TIMED_POLICIES),
            wallet
        );
        let currencyGovernance: CurrencyGovernance = CurrencyGovernance__factory.connect(await rootPolicy.policyFor(ID_CURRENCY_GOVERNANCE), wallet)
    
        this.timeGovernor = new TimeGovernor(provider, wallet, rootPolicy, timedPolicy)
        this.timeGovernor.startTimer()
    
        this.currencyGovernor = new CurrencyGovernor(provider, wallet, rootPolicy, timedPolicy, currencyGovernance)
        await this.currencyGovernor.setup()
        await this.currencyGovernor.startTimer()
        await this.currencyGovernor.generationListener()
    }
}

// export async function startSupervisor (filepath: string) {
//     let args = fs.readFileSync(filepath);
//     args = args.toString().split('\n');
//     let rpc: string = args[0];
//     let root: string = args[1];
//     provider = new ethers.providers.JsonRpcProvider(rpc);
//     let supervisorWallet: ethers.Wallet = new ethers.Wallet(pk, provider);
//     let rootPolicy: Policy = Policy__factory.connect(root, supervisorWallet);
//     startModules(supervisorWallet, rootPolicy);

// }

// export async function testStartSupervisor(rootPolicy: Policy, account: SignerWithAddress) {
//     provider = hre.ethers.provider
//     return  startModules(account, rootPolicy);
// }

// async function startModules(wallet: ethers.Signer, rootPolicy: Policy) {
//     let timedPolicy: TimedPolicies = TimedPolicies__factory.connect(
//         await rootPolicy.policyFor(ID_TIMED_POLICIES),
//         wallet
//     );
//     let currencyGovernance: CurrencyGovernance = CurrencyGovernance__factory.connect(await rootPolicy.policyFor(ID_CURRENCY_GOVERNANCE), wallet)

//     let timeGovernor: TimeGovernor = new TimeGovernor(provider, wallet, rootPolicy, timedPolicy)
//     await timeGovernor.startTimer()

//     let currencyGovernor: CurrencyGovernor = new CurrencyGovernor(provider, wallet, rootPolicy, timedPolicy, currencyGovernance)
//     await currencyGovernor.setup()
//     await currencyGovernor.startTimer()

//     return ([timeGovernor, currencyGovernor])
// }
