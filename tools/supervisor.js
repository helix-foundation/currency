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
  }

  async updateGeneration() {
    print('generation updated');
  }

  async catchup() {
    this.eco = new ethers.Contract(await this.policy.methods.policyFor(ID_E))
    this.timedPolicies = new ethers.Contract(await this.policy.methods.policyFor(ID_TIMEDPOLICIES).call(),
      { from: this.account },
    );


  }

  async processBlock() {
    let block = await provider.getBlock('latest');
    this.blockNumber = block.number;
    // this.timestamp = block.timestamp;
    // if (timestamp < nextGenerationStart) {
    //   updateGeneration();
    // }
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
