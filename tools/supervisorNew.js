const web3 = require('web3');
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const { getTree, answer, arrayToTree, } = require('./randomInflationUtils');

/* eslint-disable no-console */
/* eslint no-bitwise: 0 */
/* eslint-disable no-param-reassign, no-await-in-loop */
/* eslint-disable no-lone-blocks, no-underscore-dangle */

let provider;


function getABI(contract) {
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

// Contract ABIs and Bytecode
const PolicyABI = getABI('Policy');
const ECO = getABI('ECO');
const TimedPoliciesABI = getABI('TimedPolicies');
const PolicyProposalsABI = getABI('PolicyProposals');
const PolicyVotesABI = getABI('PolicyVotes');
// const TrustedNodesABI = getABI('TrustedNodes');
// const VDFVerifierABI = getABI('VDFVerifier');
const CurrencyGovernanceABI = getABI('CurrencyGovernance');
const CurrencyTimerABI = getABI('CurrencyTimer');
const InflationABI = getABI('Inflation');
// const LockupContractABI = getABI('Lockup');
const InflationRootHashProposalABI = getABI('InflationRootHashProposal');

const ID_TIMED_POLICIES = web3.utils.soliditySha3('TimedPolicies');
const ID_CURRENCY_TIMER = web3.utils.soliditySha3('CurrencyTimer');
const ID_CURRENCY_GOVERNANCE = web3.utils.soliditySha3('CurrencyGovernance');
// const ID_TRUSTED_NODES = web3.utils.soliditySha3('TrustedNodes');
const ID_ERC20TOKEN = web3.utils.soliditySha3('ERC20Token');
const ID_ECO = web3.utils.soliditySha3('ECO');
const ID_POLICY_PROPOSALS = web3.utils.soliditySha3('PolicyProposals');
const ID_POLICY_VOTES = web3.utils.soliditySha3('PolicyVotes');

const { toBN } = web3.utils;

// useful time constants
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

// time before next generation that auto refund is called
const REFUND_BUFFER = HOUR;
// length of a generation
const GENERATION_TIME = 14 * DAY;

class Supervisor {
  constructor(policyAddr, signer) {
    this.signer = signer;

    this.policy = new ethers.Contract(policyAddr, PolicyABI.abi, this.signer);

    // some things only need to be redeployed in the event of a successful policy change
    this.policyChange = true;

    this.cumulativeBalances = {};

    // generational info
    this.currentGenerationBlock;
    this.currentGenerationStartTime;
    this.nextGenerationStartTime;
  }

  async updateGeneration() {
    if (this.timestamp > this.nextGenerationStart) {
      await this.timedPolicies.incrementGeneration();
      await this.getTxHistory(this.currentGenerationBlock);
      this.currentGenerationBlock = this.blockNumber;
      this.currentGenerationStartTime = this.timestamp;
      this.nextGenerationStartTime = this.currentGenerationStartTime + GENERATION_TIME;
    }
  }

  async updateContracts() {
    // called the block after generation update
    // fetches all the new contract addresses from the registry

    // only need to fetch these if there is a policy change
    if (this.policyChange) {
      this.timedPolicies = new ethers.Contract(
        await this.policy.policyFor(ID_TIMED_POLICIES),
        TimedPoliciesABI.abi,
        this.signer,
      );
      console.log(`timedpolicies address is: ${this.timedPolicies.address}`);

      this.currencyTimer = new ethers.Contract(
        await this.policy.policyFor(ID_CURRENCY_TIMER),
        CurrencyTimerABI.abi,
        this.signer,
      );
      console.log(`currencyTimer address is: ${this.currencyTimer.address}`);

      // TODO: this is giving the 0 address, investigate
      this.eco = new ethers.Contract(
        await this.policy.policyFor(ID_ECO),
        ECO.abi,
        this.signer,
      );
      console.log(`ECO address is: ${this.eco.address}`);
    }

    // need to fetch every generation
    this.policyProposals = new ethers.Contract(
      await this.policy.policyFor(ID_POLICY_PROPOSALS),
      PolicyProposalsABI.abi,
      this.signer,
    );
    console.log(`policyProposals address is: ${this.policyProposals.address}`);

    this.currencyGovernance = new ethers.Contract(
      await this.policy.policyFor(ID_CURRENCY_GOVERNANCE),
      CurrencyGovernanceABI.abi,
      this.signer,
    );
    console.log(`currencyGovernance address is: ${this.currencyGovernance.address}`);
    const filter = this.currencyTimer.filters.InflationStarted();
    const events = this.currencyTimer.queryFilter(filter);


    this.randomInflation = new ethers.Contract(
      await this.currencyTimer.inflationImpl(),
      InflationABI.abi,
      this.signer,
    );
    console.log(`randomInflation address is: ${this.randomInflation.address}`);

    this.inflationRootHashProposal = new ethers.Contract(
      await this.currencyTimer.inflationRootHashProposalImpl(),
      InflationRootHashProposalABI.abi,
      this.signer,
    );
    console.log(`InflationRootHashProposal address is: ${this.inflationRootHashProposal.address}`);
  }

  async manageCommunityGovernance() {
    return null;
  }

  async manageCurrencyGovernance() {
    // updates the stage of the currency governance process

   return null;
  }

  async manageRandomInflation() {
    return null;
  }

  async catchup() {
    await this.updateContracts();

    this.policyChange = false;
    // set initial generation information

    // search for generation start
    const filter = this.timedPolicies.filters.PolicyDecisionStarted();
    filter.fromBlock = 0;
    filter.toBlock = "latest";

    const events = await this.timedPolicies.queryFilter(filter);

    this.currentGenerationBlock = events[events.length - 1].blockNumber;
    this.currentGenerationStartTime = await provider.getBlock(
      this.currentGenerationBlock,
    ).timeStamp;
    this.nextGenerationStartTime = this.currentGenerationStartTime + GENERATION_TIME;

    // await this.getTxHistory(0);
  }

  async getTxHistory(fromBlock) {
    return null;
  }

  async processBlock() {
    console.log(`processing block ${this.blockNumber}`);
    const block = await provider.getBlock('latest');
    this.blockNumber = block.number;
    this.timestamp = block.timestamp;
    if (this.timestamp > this.nextGenerationStartTime) {
      console.log(`current time is ${this.timeStamp}, nextGenerationStart is ${this.nextGenerationStartTime}, updating generation`);
      await this.updateGeneration();
    } else if (this.currentGenerationBlock === this.blockNumber - 1) {
      console.log(`current generation block is ${this.currentGenerationBlock}, this.blockNumber is ${this.blockNumber}, updating contracts`);
      await this.updateContracts();
    } else {
      console.log('managing currency governance');
      await this.manageCurrencyGovernance();
      console.log('managing community governance');
      await this.manageCommunityGovernance();

      if (this.randomInflation) {
        console.log('managing random inflation');
        await this.manageRandomInflation();
      }
    }
    console.log(`done with block ${this.blockNumber}`);
  }

  static async start(_jsonrpcProviderString, _rootPolicy) {

    provider = new ethers.providers.JsonRpcProvider(_jsonrpcProviderString);
    const signer = await provider.getSigner()

    const supervisor = await new Supervisor(
      _rootPolicy,
      signer,
    );
    console.log('STARTED');

    await supervisor.catchup();

    console.log('CAUGHT UP');

    provider.on('block', () => {
      supervisor.processBlock();
    });
  }
}

let args = fs.readFileSync('tools/supervisorInputs.txt');
args = new String(args).split('\n');
let jsonrpcProviderString = args[0]
let rootPolicy = args[1]

console.log(jsonrpcProviderString);
console.log(rootPolicy);

Supervisor.start(jsonrpcProviderString, rootPolicy);

module.exports = {
  Supervisor,
};
