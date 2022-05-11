const { ethers } = require("ethers");
const fs = require('fs');
const path = require('path');

let currentGenerationStart = 0;
let nextGenerationStart = 0;


//change this later
const provider = new ethers.providers.JsonRpcProvider();
const signer = provider.getSigner();


function req(contract) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, `../build/contracts/${contract}.json`)));
  } catch (e) {
    if (global.artifacts === undefined) {
      // logger.info(e);
      throw new Error("Run 'truffle compile'", e);
    }
    return artifacts.require(contract)._json;
  }
}

// ### Contract ABIs and Bytecode
const PolicyABI = req('Policy');
const ECO = req('ECO');
const TimedPoliciesABI = req('TimedPolicies');
const EcoBalanceStoreABI = req('EcoBalanceStore');
const PolicyProposalContractABI = req('PolicyProposals');
const PolicyVotesContractABI = req('PolicyVotes');
const TrustedNodesABI = req('TrustedNodes');
const VDFVerifierABI = req('VDFVerifier');
const CurrencyGovernanceABI = req('CurrencyGovernance');
// const CurrencyTimerABI = req('CurrencyTimer');
const InflationABI = req('Inflation');
const LockupContractABI = req('Lockup');
const InflationRootHashProposal = req('InflationRootHashProposal');

const ID_TIMEDPOLICIES = web3.utils.soliditySha3('TimedPolicies');
// const ID_CURRENCY_TIMER = web3.utils.soliditySha3('CurrencyTimer');
const ID_TRUSTED_NODES = web3.utils.soliditySha3('TrustedNodes');
const ID_ERC20TOKEN = web3.utils.soliditySha3('ERC20Token');

// const { toBN } = web3.utils;


class Supervisor {
  constructor(policyAddr, account) {
    // this.policy = new web3.eth.Contract(PolicyABI.abi, policyAddr);
    this.policy = new ethers.Contract(policyAddr, PolicyABI.abi);
    this.timedPoliciesEventStamp = 0;
    this.policyDecisionAddresses = new Set();
    this.policyVotesAddressesExecuted = new Set();
    this.currencyAddresses = new Set();
    this.account = account;
    this.timedPolicies = 0;
    this.currentGenerationBlock = 0;
  }

  async updateGeneration() {
    this.currentGenerationBlock = this.blockNumber
    print('generation updated');
  }

  async updateContracts() {
    //called the block after generation update
    //fetches all the new contract addresses from the registry
    this.eco = new ethers.Contract(await this.policy.methods.policyFor(ID_ERC20TOKEN).call(),
      { from: this.account }
    );
    this.timedPolicies = new ethers.Contract(await this.policy.methods.policyFor(ID_TIMEDPOLICIES).call(),
      { from: this.account },
    );
    this.currencyGovernance = new ethers.Contract(await this.policy.methods.policyFor(ID_CURRENCY_GOVERNANCE).call(),
      { from: this.account },
    );
    this.policyProposals = new ethers.Contract(await this.policy.methods.policyFor(ID_POLICY_PROPOSALS).call(),
      { from: this.account },
    );

  }

  async manageCommunityGovernance() {

  }

  async manageCurrencyGovernance() {

  }

  async 

  async catchup() {
    updateContracts();
    this.eco = new ethers.Contract(await this.policy.methods.policyFor(ID_E))
    this.timedPolicies = new ethers.Contract(await this.policy.methods.policyFor(ID_TIMEDPOLICIES).call(),
      { from: this.account },
    );


  }

  async processBlock() {
    let block = await provider.getBlock('latest');
    this.blockNumber = block.number;
    this.timestamp = block.timestamp;
    if (timestamp > nextGenerationStart) {
      updateGeneration();
    };
    if (this.currentGenerationBlock == this.blockNumber - 1) {
      updateContracts();
    }
    manageCurrencyGovernance();
    manageCommunityGovernance();

    console.log(this.blockNumber);

  }

  static async start(options = {}) {
    const supervisor = await new Supervisor(options.root, options.account)
    console.log('STARTED');
    if (!currentGenerationStart) {
      await catchup();
    }
    provider.on("block", (num) => {
      supervisor.processBlock();
    })
    console.log(`policy addy is as follows: ${supervisor.policy.address}`)
  }


}


module.exports = {
  Supervisor,
};
