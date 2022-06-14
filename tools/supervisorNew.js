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
// const signer = provider.getSigner();x

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

// Contract ABIs and Bytecode
const PolicyABI = req('Policy');
const ECO = req('ECO');
const TimedPoliciesABI = req('TimedPolicies');
const PolicyProposalsABI = req('PolicyProposals');
const PolicyVotesABI = req('PolicyVotes');
// const TrustedNodesABI = req('TrustedNodes');
// const VDFVerifierABI = req('VDFVerifier');
const CurrencyGovernanceABI = req('CurrencyGovernance');
const CurrencyTimerABI = req('CurrencyTimer');
const InflationABI = req('Inflation');
// const LockupContractABI = req('Lockup');
const InflationRootHashProposalABI = req('InflationRootHashProposal');

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
    if (await !this.policyProposals.proposalSelected()
      && this.timestamp < await this.policyProposals.proposalEnds()
    ) {
      const filter = this.policyProposals.filters.SupportThresholdReached();
      filter.fromBlock = 'latest';
      const events = provider.getLogs(filter);
      if (events.length === 1) {
        await this.policyProposals.deployProposalVoting();
        // this is probably wrong, how do i get the policy votes address from the deploy event?
        filter = this.policyProposals.filters.VotingStarted();
        this.policyVotes = new ethers.Contract(
          await this.policy.policyFor(ID_POLICY_VOTES),
          PolicyVotesABI.abi,
          this.signer,
        );
      }
    } else {
      if (this.policyVotes) {
        try {
          const totalVP = await this.policyVotes.totalVotingPower(this.blockNumber);
          const yesStake = await this.policyVotes.yesStake();
          if (yesStake > totalVP / 2
            || this.timestamp > await this.policyVotes.voteEnds + await this.policyVotes.ENACTION_DELAY) {
            await this.policyVotes.execute();
            this.policyChange = true;
          }
        } catch (e) {
          // console.log(e);
        }
      }
      if (this.timestamp + REFUND_BUFFER > this.nextGenerationStart) {
        // do refunds of unselected proposals
        (await this.policyProposals.allProposals()
          .forEach((proposal) => {
            this.policyProposals.refund(proposal);
          })
        );
      }
    }
  }

  async manageCurrencyGovernance() {
    // updates the stage of the currency governance process

    const stage = await this.currencyGovernance.stage();

    if ((stage === 0 && this.timestamp >= await this.currencyGovernance.proposalEnds())
        || (stage === 1 && this.timestamp >= await this.currencyGovernance.votingEnds())
        || (stage === 2 && this.timestamp >= await this.currencyGovernance.revealEnds())) {
      await this.currencyGovernance.updateStage();
    }
  }

  async manageRandomInflation() {
    if (this.inflationRootHashProposal.acceptedRootHash() != 0) {
      // automated claim logic
    } else if (this.timestamp > this.currentGenerationStartTime + 12 * DAY
      && !this.rootHashProposed) {
      await this.inflationRootHashProposal.proposeRootHash(
        this.tree.hash,
        this.tree.total,
        this.tree.items
      );
      this.rootHashProposed = true;
    } else if (this.timestamp > this.currentGenerationStartTime + 13 * DAY) {
      await this.inflationRootHashProposal.checkRootHashStatus;
    }
  }

  async catchup() {
    await this.updateContracts();

    this.policyChange = false;
    // set initial generation information

    // search for generation start
    const filter = this.timedPolicies.filters.PolicyDecisionStarted();

    const events = await provider.getLogs(filter);
    this.currentGenerationBlock = events[events.length - 1].blockNumber;
    this.currentGenerationStartTime = await provider.getBlock(
      this.currentGenerationBlock,
    ).timeStamp;
    this.nextGenerationStartTime = this.currentGenerationStartTime + GENERATION_TIME;

    await getTxHistory(0);
  }

  async getTxHistory(fromBlock) {
    // gets gons balances from 0 to start of generation

    const balanceChanges = {};

    const filter = this.eco.filters.BaseValueTransfer();
    filter.fromBlock = fromBlock;
    filter.toBlock = this.currentGenerationBlock;

    (await provider.getLogs(filter)).forEach((event) => {
      const params = event.returnValues;
      if (!toBN(params.from).eq(toBN('0')) && !toBN(params.value).eq(toBN('0'))) {
        balanceChanges[params.from] = balanceChanges[params.from].sub(toBN(params.value));
      }
      if (balanceChanges[params.to] === undefined) {
        balanceChanges[params.to] = toBN(params.value);
      } else {
        balanceChanges[params.to] = balanceChanges[params.to].add(toBN(params.value));
      }
    });

    for (const [k, v] of map) {
      if (this.cumulativeBalances.has(k)) {
        cumulativeBalances[k].add(v);
      } else {
        cumulativeBalances[k] = v;
      }
    }
  }

  async constructAccountSumMap() {
    // creates 2 lists: alphabetic addresses and their corresponding cumulative balances
    // ex: 
    // {0xc, 2; 0xa, 1; 0xb, 3}
    // --> [0xa, 0xb, 0xc], [1, 4, 6]

    const items = [];
    const accounts = [];
    const sums = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const i of this.cumulativeBalances) {
      items.push(i);
      accounts.push(i[0]);
    }
    accounts.sort((a, b) => Number(a - b));
    items.sort((a, b) => Number(a[0] - b[0]));
    const len = items.length;

    // pad with 0s
    const wantitems = 2 ** Math.ceil(Math.log2(len));
    for (let i = len; i < wantitems; i += 1) {
      items.push([0, 0]);
    }

    let sum = toBN(0);
    for (let i = 0; i < len; i += 1) {
      sums.push(sum);
      sum = sum.add(items[i][1]);
    }

    const tree = arrayToTree(items);
    tree.items = items.length - 1;
    tree.total = sum

    this.orderedAddresses = accounts;
    this.orderedSums = sums;
    this.tree = tree;
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

      console.log(`done with block ${this.blockNumber}`);
    }
  }

  static async start(options = {}) {
    provider = options.provider;
    const supervisor = await new Supervisor(
      options.root,
      options.signer,
    );
    console.log('STARTED');

    await supervisor.catchup();

    console.log('CAUGHT UP');

    provider.on('block', () => {
      supervisor.processBlock();
    });
  }
}

// let args = fs.readFileSync('tools/supervisorInputs.txt');
// args = new String(args).split('\n');
// let _signer = new ethers.Signer(JSON.parse(args[1]));
// Supervisor.start({
//   root: args[0],
//   signer: _signer
// })

module.exports = {
  Supervisor,
};
