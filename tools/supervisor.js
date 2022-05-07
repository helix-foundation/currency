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
// const ECO = req('ECO');
// const TimedPoliciesABI = req('TimedPolicies');
// const EcoBalanceStoreABI = req('EcoBalanceStore');
// const PolicyProposalContractABI = req('PolicyProposals');
// const PolicyVotesContractABI = req('PolicyVotes');
// const TrustedNodesABI = req('TrustedNodes');
// const VDFVerifierABI = req('VDFVerifier');
// const CurrencyGovernanceABI = req('CurrencyGovernance');
// // const CurrencyTimerABI = req('CurrencyTimer');
// const InflationABI = req('Inflation');
// const LockupContractABI = req('Lockup');
// const InflationRootHashProposal = req('InflationRootHashProposal');

// const ID_TIMEDPOLICIES = web3.utils.soliditySha3('TimedPolicies');
// // const ID_CURRENCY_TIMER = web3.utils.soliditySha3('CurrencyTimer');
// const ID_TRUSTED_NODES = web3.utils.soliditySha3('TrustedNodes');
// const ID_ERC20TOKEN = web3.utils.soliditySha3('ERC20Token');

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
  }

  async updateGeneration() {
    print('generation updated');
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
    provider.on("block", (num) => {
      supervisor.processBlock();
    })
    console.log(`policy addy is as follows: ${supervisor.policy.address}`)
  }


}




async function run() {
  // logger.info(`Running supervisor with options ${JSON.stringify(options)}`);

  provider.on("block", (blockNumber) => {
		processBlock();
	});

  // const policyaddr = options.root;

  // logger.info(`policyaddr: ${policyaddr}`);

  // const s = new Supervisor(policyaddr, options.account);

  // logger.info('Subscribing to newBlockHeaders');
  // web3.eth.subscribe('newBlockHeaders', (error) => {
  //   if (error) {
  //     logger.error(error);
  //   }
  // }).on('data', async (header) => {
  //   logger.info(`subscribed ${header.number} ${header.timestamp}`);
  //   await s.processBlock();
  // }).on('error', async (e) => {
  //   logger.info(`Subscription returned error ${e}`);
  //   process.exit(1);
  // });

  // // Run initial catch-up
  // await s.processAllBlocks();
}


module.exports = {
  Supervisor,
};
