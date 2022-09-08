require('dotenv').config({path: '../.env'})
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
// import { provider } from "@nomiclabs/hardhat-ethers"
import * as hre from "hardhat"
import * as ethers from "ethers";
// import { ethers } from "hardhat"
const fs = require('fs');
// const path = require('path');

import { TimeGovernor } from "./supervisor_timedPolicies"
import { CurrencyGovernor } from "./supervisor_currencyGovernance"
import { InflationGovernor } from "./supervisor_randomInflation"
// import { CurrencyGovernor } from "./supervisor_currencyGovernance"
// import { CommunityGovernor } from "./supervisor_communityGovernance"
import { Policy__factory, Policy, TimedPolicies__factory, TimedPolicies, CurrencyGovernance__factory, CurrencyGovernance } from "../typechain-types"
// import { CurrencyGovernance } from "../typechain-types/CurrencyGovernance";


let pk = process.env.PRIVATE_KEY || "";

const ID_TIMED_POLICIES = ethers.utils.solidityKeccak256(['string'], ['TimedPolicies'])
const ID_CURRENCY_GOVERNANCE = ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])

export class Supervisor {
    timeGovernor!: TimeGovernor
    currencyGovernor!: CurrencyGovernor
    inflationGovernor!: InflationGovernor
    provider!: ethers.providers.BaseProvider
    rootPolicy!: Policy
    wallet!: ethers.Signer



    constructor () {
        
    }


    async startSupervisor (filepath?: string, policy?: Policy, signer?: ethers.Signer) {
        if (filepath) {
            // prod
            let args = fs.readFileSync(filepath);
            args = args.toString().split('\n');
            let rpc: string = args[0];
            let root: string = args[1];
            this.provider = new ethers.providers.JsonRpcProvider(rpc);
            this.wallet = new ethers.Wallet(pk, this.provider);
            this.rootPolicy = Policy__factory.connect(root, this.wallet);
        } else {
            // test
            if(signer && policy) {
                this.provider = hre.ethers.provider
                this.wallet = signer
                this.rootPolicy = policy
            }
        }
    
        this.startModules(this.provider, this.wallet, this.rootPolicy);
    
    }
    
    async startModules(provider: ethers.providers.BaseProvider, wallet: ethers.Signer, rootPolicy: Policy) {
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

        this.inflationGovernor = new InflationGovernor(provider, wallet, rootPolicy, timedPolicy)
        this.inflationGovernor.setup()
    }
}
