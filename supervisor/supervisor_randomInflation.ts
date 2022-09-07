

import * as ethers from "ethers";

import { Policy, TimedPolicies, CurrencyTimer, CurrencyTimer__factory, RandomInflation, RandomInflation__factory, InflationRootHashProposal, InflationRootHashProposal__factory, VDFVerifier, VDFVerifier__factory } from "../typechain-types"

const ID_CURRENCY_TIMER = ethers.utils.solidityKeccak256(['string'], ['CurrencyTimer'])

export class InflationGovernor {
    provider: ethers.providers.BaseProvider
    wallet: ethers.Signer
    policy: Policy
    timedPolicy: TimedPolicies
    currencyTimer!: CurrencyTimer
    randomInflation!: RandomInflation
    inflationRootHashProposal!: InflationRootHashProposal
    vdfVerifier!: VDFVerifier
    nextGenStart: number = 0
    triedUpdate: Boolean = false


    constructor(provider: ethers.providers.BaseProvider, supervisorWallet: ethers.Signer, rootPolicy: Policy, timedPolicy: TimedPolicies) {
        this.provider = provider
        this.wallet = supervisorWallet
        this.policy = rootPolicy
        this.timedPolicy = timedPolicy
    };

    async setup() {
        this.currencyTimer = CurrencyTimer__factory.connect(await this.policy.policyFor(ID_CURRENCY_TIMER), this.wallet)
    }

    async inflationListener() {
        this.currencyTimer.on("NewInflation", async (inflationAddr, _) => {
            this.randomInflation = await RandomInflation__factory.connect(inflationAddr, this.wallet)
            this.inflationRootHashProposal = InflationRootHashProposal__factory.connect(await this.randomInflation.inflationRootHashProposal(), this.wallet)
            this.vdfVerifier = VDFVerifier__factory.connect((await this.randomInflation.vdfVerifier()), this.wallet)
        })
    }
} 