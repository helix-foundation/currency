const { ethers } = require("ethers");
const fs = require('fs');
const path = require('path');

//change this later
const provider = new ethers.providers.JsonRpcProvider();
// const signer = provider.getSigner();x

// async function testshit() {
//   provider.on("block", async (num) => {
//       // supervisor.processBlock();
//       let block = await provider.getBlock('latest');
//       console.log(block.timestamp);
//       let date = new Date(block.timestamp*1000);
//       let twoWksLater = new Date((block.timestamp + 14*24*3600)*1000);
//       console.log(date);
//       console.log(twoWksLater);

//   });
// };

// testshit();


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

//Contract ABIs and Bytecode
const PolicyABI = req('Policy');
const ECO = req('ECO');
const TimedPoliciesABI = req('TimedPolicies');
const PolicyProposalsABI = req('PolicyProposals');
const PolicyVotesABI = req('PolicyVotes');
const TrustedNodesABI = req('TrustedNodes');
const VDFVerifierABI = req('VDFVerifier');
const CurrencyGovernanceABI = req('CurrencyGovernance');
const CurrencyTimerABI = req('CurrencyTimer');
const InflationABI = req('Inflation');
const LockupContractABI = req('Lockup');
const InflationRootHashProposal = req('InflationRootHashProposal');

const ID_TIMED_POLICIES = web3.utils.soliditySha3('TimedPolicies');
const ID_CURRENCY_TIMER = web3.utils.soliditySha3('CurrencyTimer');
const ID_CURRENCY_GOVERNANCE = web3.utils.soliditySha3('CurrencyGovernance');
const ID_TRUSTED_NODES = web3.utils.soliditySha3('TrustedNodes');
const ID_ERC20TOKEN = web3.utils.soliditySha3('ERC20Token');
const ID_POLICY_PROPOSALS = web3.utils.soliditySha3('PolicyProposals');
const ID_POLICY_VOTES = web3.utils.soliditySha3('PolicyVotes');

const { toBN } = web3.utils;

//useful time constants
const HOUR = 3600*1000;
const DAY = 24 * HOUR;

// time before next generation that auto refund is called
const REFUND_BUFFER = HOUR;
// length of a generation
const GENERATION_TIME = 14 * DAY;


class Supervisor {
  constructor(policyAddr, signer, account) {
    this.signer = signer;
    // this.policy = new web3.eth.Contract(PolicyABI.abi, policyAddr);
    this.policy = new ethers.Contract(policyAddr, PolicyABI.abi, this.signer);
    this.account = account;
    // this.policyDecisionAddresses = new Set();
    // this.policyVotesAddressesExecuted = new Set();
    // this.currencyAddresses = new Set();

    // some things only need to be redeployed in the event of a successful policy change
    this.policyChange = true;

    // generational info
    this.currentGenerationBlock = 0;
    this.currentGenerationStartTime = 0;
    this.nextGenerationStartTime = 0;

  }

  async updateGeneration() {
    if (this.timestamp > this.nextGenerationStart) {
      await this.timedPolicies.incrementGeneration({ from: this.account });
      this.currentGenerationBlock = this.blockNumber;
      this.currentGenerationStartTime = this.timestamp;
      this.nextGenerationStartTime = this.currentGenerationStartTime + generationTime;
    };

  }

  async updateContracts() {
    //called the block after generation update
    //fetches all the new contract addresses from the registry

    //only need to re-fetch these sometimes
    if (this.policyChange) {

      this.timedPolicies = new ethers.Contract(await this.policy.policyFor(ID_TIMED_POLICIES),
        TimedPoliciesABI.abi,
        this.signer,
      );
      console.log(`timedpolicies address is: ${this.timedPolicies.address}`);

      this.currencyTimer = new ethers.Contract(await this.policy.policyFor(ID_CURRENCY_TIMER),
        CurrencyTimerABI.abi,
        this.signer
      );
      console.log(`currencyTimer address is: ${this.currencyTimer.address}`);

      // TODO: this is giving the 0 address, investigate
      this.eco = new ethers.Contract(await this.policy.policyFor(ID_ERC20TOKEN),
        ECO.abi,
        this.signer,
      );
      console.log(`ECO address is: ${this.eco.address}`);

    }

    this.policyProposals = new ethers.Contract(await this.policy.policyFor(ID_POLICY_PROPOSALS),
      PolicyProposalsABI.abi,
      this.signer,
    );
    console.log(`policyProposals address is: ${this.policyProposals.address}`);

    this.currencyGovernance = new ethers.Contract(await this.policy.policyFor(ID_CURRENCY_GOVERNANCE),
      CurrencyGovernanceABI.abi,
      this.signer,
    );
    console.log(`currencyGovernance address is: ${this.currencyGovernance.address}`);

    this.randomInflation = new ethers.Contract(await this.currencyTimer.inflationImpl(),
      InflationABI.abi,
      this.signer
    );
    console.log(`randomInflation address is: ${this.currencyTimer.address}`);
    
  }

  async manageCommunityGovernance() {
    if (await !this.policyProposals.proposalSelected() && this.timestamp < await this.policyProposals.proposalEnds()) {
      let events = this.policyProposals.queryFilter("SupportThresholdReached", "latest");
      if (len(events) == 1) {
        await this.policyProposals.deployProposalVoting({ from: this.account });
        //this is probably wrong, how do i get the policy votes address from the event emitted by the deploy? 
        this.policyVotes = new ethers.Contract(await this.policy.policyFor(ID_POLICY_VOTES),
          PolicyVotesABI,
          { from: this.account }
        );
      }
    } else {
      if (this.policyVotes) {
        // seems inefficient but ok for now
        try {
          // will revert most of the time
          await this.policyVotes.execute();
          this.policyChange = true;
        } catch (e) {
          console.log(e)
        }
        
      };
      if (this.timestamp + REFUND_BUFFER > this.nextGenerationStart) {
        // do refunds of unselected proposals
        (await this.policyProposals.allProposals()
          .forEach((proposal) => {
            this.policyProposals.refund(proposal, { from: this.account });
          })
        );
      }
    }
  }

  async manageCurrencyGovernance() {
    //updates the stage of the currency governance process

    //can be more granular about this, the logging might be ugly, but is this ok wrt gas cost?
    try {
      await this.currencyGovernance.updateStage();
      try {
        await this.currencyGovernance.compute();
      } catch (e) {
        console.log(e);
      }
    } catch (e) {
      console.log(e);
    }
  }

  async manageRandomInflation() {
    // TODO
  }

  async catchup() {

    await this.updateContracts();

    this.policyChange = false;
    //set initial generation information

    const filter = this.timedPolicies.filters.PolicyDecisionStarted();
    filter.fromBlock = "latest" - 20; // replace with latest - 1 generation of blocks
    filter.toBlock = "latest";

    const events = await provider.getLogs(filter);
    this.currentGenerationBlock = events[0].blockNumber;
    this.currentGenerationStartTime = await provider.getBlock(this.currentGenerationBlock).timeStamp;
    this.nextGenerationStartTime = this.currentGenerationStartTime + GENERATION_TIME;


    // get full tx history until now, to set up balances for randominflation
    // await getTxHistory();


  }

  async getTxHistory() {
    // blocked by transfer event redefinition
    return null;

    const map = {};

    // const token = await this.getERC20Token();
    (await this.eco.queryFilter('Transfer', {
      fromBlock: 0,
      toBlock: 'latest',
    })).forEach((event) => {
      const params = event.returnValues;
      if (!toBN(params.from).eq(toBN('0')) && !toBN(params.value).eq(toBN('0'))) {
        map[params.from] = map[params.from].sub(toBN(params.value));
      }
      if (map[params.to] === undefined) {
        map[params.to] = toBN(params.value);
      } else {
        map[params.to] = map[params.to].add(toBN(params.value));
      }
    });

    // return map;
  }



  async processBlock() {
    let block = await provider.getBlock('latest');
    this.blockNumber = block.number;
    this.timestamp = block.timestamp;
    if (timestamp > nextGenerationStart) {
      await updateGeneration();
      return;
    };

    if (this.currentGenerationBlock == this.blockNumber - 1) {
      updateContracts();
      return;
    }

    manageCurrencyGovernance();
    manageCommunityGovernance();
    if (this.randomInflation) {
      manageRandomInflation();
    }

    console.log(this.blockNumber);

  }

  static async start(options = {}) {
    const supervisor = await new Supervisor(options.root, options.signer, await options.signer.getAddress());
    console.log('STARTED');

    supervisor.catchup();

    provider.on("block", (num) => {
      // supervisor.processBlock();
      console.log(num);
      
    })
    // provider.on("Transfer",)


    // console.log(`policy address is: ${supervisor.policy.address}`)
  }


}

module.exports = {
  Supervisor,
};
