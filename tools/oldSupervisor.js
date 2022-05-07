#!/usr/bin/env node

/* eslint-env es6 */
/* eslint no-bitwise: 0 */
/* eslint-disable no-param-reassign, no-await-in-loop */
/* eslint-disable no-lone-blocks, no-underscore-dangle */

// # Supervising currency contracts

const fs = require('fs');
const path = require('path');
const winston = require('winston');
const abiDecoder = require('abi-decoder');
const { Mutex } = require('async-mutex');

const {
  killVDFCalculation,
  spawnVDFSolver,
  testVDFSolver,
  existRunningVDFProc,
  ENTROPY,
  REVEAL,
} = require('./utils');

const { n, bnHex } = require('./vdf');

const {
  getTree,
  answer,
} = require('./ticketlessInflationUtils');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.prettyPrint(),
  ),
  transports: [
    new winston.transports.File({ filename: `${__dirname}/../log/supervisor.log`, level: 'info' }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

function req(contract) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(__dirname, `../build/contracts/${contract}.json`)));
  } catch (e) {
    if (global.artifacts === undefined) {
      logger.info(e);
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

const { toBN } = web3.utils;

async function updateVdfVerifier(vdfAddress, payer, seed, difficulty, key, proof) {
  const vdf = new web3.eth.Contract(
    VDFVerifierABI.abi,
    vdfAddress,
    { from: payer },
  );
  await vdf.methods.start(bnHex(toBN(seed)), difficulty, bnHex(toBN(key))).send({ gas: 4000000 });
  for (let i = 0; i < proof.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await vdf.methods.update(i + 1, bnHex(toBN(proof[i]))).send({ gas: 4000000 });
  }
}

function solveAndSubmitEntropy(governance, inflation, vdfAddress, seed, difficulty, payer) {
  spawnVDFSolver(seed, difficulty, n, null, governance._address, ENTROPY, async (key, proof) => {
    await updateVdfVerifier(vdfAddress, payer, seed, difficulty, key, proof);
    await inflation.methods.submitEntropyVDF(bnHex(toBN(key))).send({ gas: 4000000 });
  });
}

function solveAndSubmitReveal(node, governance, vdfAddress, seed, difficulty, payer) {
  spawnVDFSolver(seed, difficulty, n, node, governance._address, REVEAL, async (key, proof) => {
    await updateVdfVerifier(vdfAddress, payer, seed, difficulty, key, proof);
    await governance.methods.reveal(node, bnHex(toBN(key))).send({ gas: 4000000 });
  });
}

async function isAlive(a) {
  return a !== undefined && await web3.eth.getTransactionCount(a) !== 0;
}

// Modifies passed list in-place
async function pruneLiveAddresses(set) {
  const list = Array.from(set);

  for (let i = 0; i < list.length; i += 1) {
    const a = list[i];
    if (await web3.eth.getTransactionCount(a) === 0) {
      set.delete(a);
    }
  }
}

class Supervisor {
  constructor(policyAddr, account) {
    this.policy = new web3.eth.Contract(PolicyABI.abi, policyAddr);
    this.timedPoliciesEventStamp = 0;
    this.policyDecisionAddresses = new Set();
    this.policyVotesAddressesExecuted = new Set();
    this.currencyAddresses = new Set();
    this.mutex = new Mutex();
    this.account = account;
    this.rootHashState = {};
    testVDFSolver();
  }

  static getWinner(ticket, accounts, sums) {
    if (toBN(ticket) === 0) {
      return [0, accounts[0]];
    }
    let index = sums.findIndex((element) => element.gt(toBN(ticket)));
    index = index === -1 ? 2 : index - 1;
    return [index, accounts[index]];
  }

  getClaimParameters(contractAddress, seed, sequence) {
    const { tree, accounts, sums } = this.rootHashState[contractAddress];
    const winningTicketHash = web3.utils.soliditySha3({
      t: 'bytes32',
      v: seed,
    }, {
      t: 'uint256',
      v: sequence,
    });
    const [index, winner] = Supervisor.getWinner(
      toBN(winningTicketHash).mod(toBN(tree.total)),
      accounts,
      sums,
    );
    return [answer(tree, index), index, winner];
  }

  async getBalanceStore() {
    return new web3.eth.Contract(
      EcoBalanceStoreABI.abi,
      await this.policy.methods.policyFor(ID_ERC20TOKEN).call(),
      {
        from: this.account,
      },
    );
  }

  async getERC20Token() {
    return new web3.eth.Contract(
      ECO.abi,
      await this.policy.methods.policyFor(ID_ERC20TOKEN).call(),
      {
        from: this.account,
      },
    );
  }

  async constructAccountsMap() {
    const map = {};
    const token = await this.getERC20Token();
    (await token.getPastEvents('Transfer', {
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
    return map;
  }

  static constructAccountSumMap(accountsMap) {
    const items = [];
    const accounts = [];
    const sums = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const i of accountsMap) {
      items.push(i);
      accounts.push(i[0]);
    }
    accounts.sort((a, b) => Number(a - b));
    items.sort((a, b) => Number(a[0] - b[0]));
    const len = items.length;
    const wantitems = 2 ** Math.ceil(Math.log2(len));
    for (let i = len; i < wantitems; i += 1) {
      items.push([0, 0]);
    }
    let sum = toBN(0);
    for (let i = 0; i < len; i += 1) {
      sums.push(sum);
      sum = sum.add(items[i][1]);
    }
    return { accounts, sums };
  }

  async constructTreeData() {
    const accountsMap = new Map(Object.entries(await this.constructAccountsMap()));
    const { accounts, sums } = Supervisor.constructAccountSumMap(accountsMap);
    const tree = getTree(accountsMap);
    return { tree, accounts, sums };
  }

  async getRootHashContract(inflation) {
    const store = await this.getBalanceStore();
    const gen = await inflation.methods.generation().call();
    return new web3.eth.Contract(
      InflationRootHashProposal.abi,
      await store.methods.rootHashAddressPerGeneration(gen).call(),
      {
        from: this.account,
      },
    );
  }

  async proposeRootHash(tree, addressRootHashProposal) {
    const rootHashProposal = new web3.eth.Contract(
      InflationRootHashProposal.abi,
      addressRootHashProposal,
      {
        from: this.account,
      },
    );
    const token = await this.getERC20Token();
    const balance = await token.methods.balance(this.account).call();
    token.methods.approve(addressRootHashProposal, balance).send({ gas: 1000000 });

    await rootHashProposal.methods.proposeRootHash(
      tree.hash,
      bnHex(tree.total),
      tree.items,
    )
      .send({ gas: 1000000 });
  }

  async processTimedPolicies() {
    const timedpolicies = new web3.eth.Contract(
      TimedPoliciesABI.abi,
      await this.policy.methods.policyFor(ID_TIMEDPOLICIES).call(),
      { from: this.account },
    );

    // const currencyTimer = new web3.eth.Contract(
    //   CurrencyTimerABI.abi,
    //   await this.policy.methods.policyFor(ID_CURRENCY_TIMER).call(),
    //   { from: this.account },
    // );

    if (await timedpolicies.methods.nextGenerationStart().call() < this.timeStamp) {
      logger.info('Increasing Balance generation');
      const token = await this.getERC20Token();
      const { tree, accounts, sums } = await this.constructTreeData();
      await timedpolicies.methods.incrementGeneration().send({ gas: 4000000 });

      // TODO: This violates one-transaction-per-pass, allowing third party to break supervisor
      const pastEvents = await token.getPastEvents('allEvents', {
        fromBlock: 'latest',
        toBlock: 'latest',
      });
      const addressRootHashProposal = pastEvents[0].returnValues.inflationRootHashProposalContract;
      if (addressRootHashProposal) {
        await this.proposeRootHash(tree, addressRootHashProposal);
        this.rootHashState[addressRootHashProposal] = {
          tree, accounts, sums, status: 'Pending',
        };
      }
      return true;
    }

    const lastStamp = this.timedPoliciesEventStamp;
    (await timedpolicies.getPastEvents('PolicyDecisionStarted', { fromBlock: lastStamp, toBlock: this.blockNumber }))
      .map((event) => event.returnValues[0])
      .forEach((event) => {
        this.policyDecisionAddresses.add(event);
      });
    this.timedPoliciesEventStamp = this.blockNumber + 1;

    return false;
  }

  async processRootHashProposals() {
    const rootHashAddresses = Object.keys(this.rootHashState).filter((key) => this.rootHashState[key].status === 'Pending');
    for (let i = 0; i < rootHashAddresses.length; i += 1) {
      const rootHashProposal = new web3.eth.Contract(
        InflationRootHashProposal.abi,
        rootHashAddresses[i],
        {
          from: this.account,
        },
      );
      const responses = (await rootHashProposal.getPastEvents('ChallengeResponseVerified', {
        fromBlock: 0,
        toBlock: 'latest',
      })).map((el) => ({ eventParams: el.returnValues, tx: el.transactionHash }));

      const challenges = (await rootHashProposal.getPastEvents('RootHashChallengeIndexRequestAdded', {
        fromBlock: 0,
        toBlock: 'latest',
      })).map((el) => ({ eventParams: el.returnValues, tx: el.transactionHash }));

      const proposals = (await rootHashProposal.getPastEvents('RootHashProposed', {
        fromBlock: 0,
        toBlock: 'latest',
      })).map((el) => ({ eventParams: el.returnValues, tx: el.transactionHash }));

      await this.respondToPendingChallenges(challenges, responses, rootHashProposal);
      await this.challengeWrongProposals(challenges, responses, proposals, rootHashProposal);
    }
  }

  async respondToPendingChallenges(challenges, responses, rootHashProposal) {
    const challengesToRespond = challenges.map((el) => el.eventParams).filter((el) => {
      if (el.proposer !== this.account) {
        return false;
      }
      for (let j = 0; j < responses.length; j += 1) {
        if (el.proposedRootHash === responses[j].eventParams.proposedRootHash
          && el.proposer === responses[j].eventParams.proposer
          && el.index === responses[j].eventParams.index) {
          return false;
        }
      }
      return true;
    }).concat();
    for (let j = 0; j < challengesToRespond.length; j += 1) {
      const index = parseInt(challengesToRespond[j].index, 10);
      const a = answer(this.rootHashState[rootHashProposal._address].tree, index);
      await rootHashProposal.methods.respondToChallenge(
        challengesToRespond[j].challenger,
        a[1].reverse(),
        a[0].account,
        bnHex(a[0].balance),
        bnHex(a[0].sum),
        index,
      ).send({ gas: 1000000 });
    }
  }

  async challengeWrongProposals(challenges, responses, proposals, rootHashProposal) {
    proposals = proposals.filter((el) => el.eventParams.proposer !== this.account);
    // run over each root hash proposal
    for (let j = 0; j < proposals.length; j += 1) {
      // detect if there is non responded challenge for current proposal
      const pendingChallenges = challenges.map((el) => el.eventParams).filter((el) => {
        // filter out challenges to our own proposals
        // filter in only challenges for current proposal
        if (el.proposer === this.account || el.proposedRootHash
           !== proposals[j].eventParams.proposedRootHash) {
          return false;
        }
        // filter out all challenges with exist responses
        for (let k = 0; k < responses.length; k += 1) {
          if (el.proposedRootHash === responses[k].eventParams.proposedRootHash
            && el.proposer === responses[k].eventParams.proposer
            && el.index === responses[k].eventParams.index) {
            return false;
          }
        }
        return true;
      });
      const relevantResponses = responses.filter((el) => el.eventParams.proposedRootHash
      === proposals[j].eventParams.proposedRootHash && el.eventParams.proposer
      === proposals[j].eventParams.proposer);
      // nothing to do if there are pending challenges to the current proposal
      if (pendingChallenges.length === 0) {
        // challenge current proposal
        await this.interrogateProposal(
          proposals[j],
          rootHashProposal,
          this.rootHashState[rootHashProposal._address].tree,
          relevantResponses,
        );
      }
    }
  }

  static async answerFromResponse(rootHashProposal, response) {
    abiDecoder.addABI(rootHashProposal.abi);
    const tx = await web3.eth.getTransaction(response.tx);
    const data = abiDecoder.decodeMethod(tx.input);
    const { account } = response.eventParams;
    return [{ account }, data];
  }

  async interrogateProposal(proposal, rootHashProposal, tree, responses) {
    let lastIndex;
    const { proposer } = proposal.eventParams;
    if (responses.length !== 0) {
      lastIndex = parseInt(responses[responses.length - 1].eventParams.index, 10);
    } else {
      await rootHashProposal.methods.challengeRootHashRequestAccount(
        proposer,
        0,
      ).send({ gas: 1000000 });
      return;
    }

    const mine = answer(tree, lastIndex);
    const theirs = this.answerFromResponse(rootHashProposal, responses[lastIndex]);

    if (theirs[0].account > mine[0].account) {
      if (lastIndex > 0) {
        await rootHashProposal.methods.challengeRootHashRequestAccount(
          proposer,
          lastIndex - 1,
        ).send({ gas: 1000000 });
      }
      await rootHashProposal.methods.claimMissingAccount(
        proposer,
        lastIndex,
        mine[0].account,
      ).send({ gas: 1000000 });
    }

    for (let i = 0; i < mine[1].length; i += 1) {
      const a = mine[1][mine[1].length - i - 1];
      const b = theirs[1][theirs[1].length - i - 1];
      if (a !== b) {
        lastIndex += (1 << i);
        break;
      }
    }
    await rootHashProposal.methods.challengeRootHashRequestAccount(
      proposer,
      0,
    ).send({ gas: 1000000 });
  }

  async processProposals() {
    await pruneLiveAddresses(this.policyDecisionAddresses);
    const list = Array.from(this.policyDecisionAddresses);
    for (let idx = 0; idx < list.length; idx += 1) {
      const address = list[idx];

      const proposals = new web3.eth.Contract(
        PolicyProposalContractABI.abi,
        address,
        { from: this.account },
      );

      const votesAddress = (await proposals.getPastEvents('VotingStarted', { fromBlock: 0, toBlock: 'latest' }))
        .map((x) => x.returnValues.contractAddress)
        .shift();

      if (votesAddress !== undefined
        && await web3.eth.getTransactionCount(votesAddress) !== 0
        && !this.policyVotesAddressesExecuted.has(votesAddress)) {
        const votes = new web3.eth.Contract(
          PolicyVotesContractABI.abi,
          votesAddress,
          { from: this.account },
        );

        if (await votes.methods.voteEnds().call() < this.timeStamp) {
          logger.info('Executing PolicyVotes');
          await votes.methods.execute().send({ gas: 4000000 });
          this.policyVotesAddressesExecuted.add(votesAddress);
          return true;
        }
      } else if (await proposals.methods.proposalEnds().call() < this.timeStamp) {
        const props = (await proposals.getPastEvents('ProposalAdded', { fromBlock: 0, toBlock: 'latest' }))
          .map((x) => x.returnValues.proposalAddress);
        for (let i = 0; i < props.length; i += 1) {
          const prop = await proposals.methods.proposals(props[i]).call();
          if (!toBN(prop.proposal).isZero()) {
            logger.info('Refunding proposal');
            await proposals.methods.refund(prop.proposal).send({ gas: 4000000 });
            return true;
          }
        }

        logger.info('Destroying PolicyProposals');
        await proposals.methods.destruct().send({ gas: 4000000 });
        this.policyDecisionAddresses.delete(address);
        return true;
      }
    }
    return false;
  }

  async processInflations() {
    const trustednodes = new web3.eth.Contract(
      TrustedNodesABI.abi,
      await this.policy.methods.policyFor(ID_TRUSTED_NODES).call(),
      { from: this.account },
    );

    const list = Array.from(this.currencyAddresses);

    for (let idx = 0; idx < list.length; idx += 1) {
      const address = list[idx];

      const governance = new web3.eth.Contract(
        CurrencyGovernanceABI.abi,
        address,
        { from: this.account },
      );

      const [certAddress] = (await governance.getPastEvents('LockupOffered', { fromBlock: 0, toBlock: 'latest' }))
        .map((x) => x.returnValues.addr);

      const [inflationAddress] = (await governance.getPastEvents('InflationStarted', { fromBlock: 0, toBlock: 'latest' }))
        .map((x) => x.returnValues.addr);

      if (inflationAddress) {
        const inflation = new web3.eth.Contract(
          InflationABI.abi,
          inflationAddress,
          { from: this.account },
        );

        const [EntropySeedRevealed] = (await inflation.getPastEvents(
          'EntropySeedRevealed',
          {
            fromBlock: (await web3.eth.getBlockNumber()) - 1,
            toBlock: 'latest',
          },
        ));

        if (EntropySeedRevealed) {
          logger.info('EntropySeedRevealed event detected, abort ongoing VDF computation');
          killVDFCalculation(null, governance._address, ENTROPY);
        }
      }
      (await governance.getPastEvents(
        'VoteRevealed',
        {
          fromBlock: 0,
          toBlock: 'latest',
        },
      )).map((x) => killVDFCalculation(x.returnValues.voter, governance._address, REVEAL));

      logger.info(`CG@${address}: Checking isAlive(address): ${await isAlive(address)}`);
      if (await isAlive(address)) {
        const numTrustedNodes = await trustednodes.methods.numTrustees().call();
        const numRevealedNodes = await governance.methods.totalRevealed.call();
        const revealedNodes = [];
        for (let i = 0; i < numRevealedNodes; i += 1) {
          const revealedNode = await governance.methods.revealedNodes(i).call();
          revealedNodes.push(revealedNode);
        }
        const votingEnds = toBN(await governance.methods.votingEnds().call()).toNumber();

        for (let i = 0; i < numTrustedNodes; i += 1) {
          // Note that 'node' here could be 0x0 for deleted nodes, but 0x0 doesn't commit
          const node = await trustednodes.methods.trustedNodes(i).call(); // TODO: this is broken
          // I don't even really know if any of this works right now
          const commitment = await governance.methods.commitments(node).call();
          if (commitment.encryptedVote !== null
              && this.timeStamp > votingEnds
              && !revealedNodes.includes(node)) {
            if (existRunningVDFProc(node, governance._address, REVEAL)) {
              logger.info('VDF computation already in progress', node);
              return false;
            }
            logger.info(`CG@${address}: Revealing vote for ${node}`);

            solveAndSubmitReveal(
              node,
              governance,
              await governance.methods.vdfVerifier().call(),
              commitment.keyVDFSeed,
              await governance.methods.votingVDFDifficulty().call(),
              this.account,
            );
            return true;
          }
        }
        const totalRevealed = toBN(await governance.methods.totalRevealed().call());
        const totalVoters = toBN(await governance.methods.totalVoters().call());
        logger.info(`CG@${address}: totalRevealed.eq(totalVoters): ${totalRevealed.eq(totalVoters)}, votingEnds/timestamp: ${new Date(votingEnds * 1000)}/${new Date(this.timeStamp * 1000)}, Time remaining ${this.timeStamp - votingEnds}`);
        if (totalRevealed.eq(totalVoters) && this.timeStamp > votingEnds) {
          logger.info('Computing inflation vote');
          const numNodes = totalRevealed.toNumber();
          const nodes = [];
          const inflationVote = {};
          const prizeVote = {};
          const certificatesVote = {};
          const interestVote = {};

          const comparator = (map) => ((a, b) => map[a].cmp(map[b]));

          for (let i = 0; i < numNodes; i += 1) {
            const node = await governance.methods.revealedNodes(i).call();
            nodes.push(node);
            inflationVote[node] = toBN(await governance.methods.inflationVotes(node).call());
            prizeVote[node] = toBN(await governance.methods.prizeVotes(node).call());
            certificatesVote[node] = toBN(
              await governance.methods.certificatesTotalVotes(node).call(),
            );
            interestVote[node] = toBN(await governance.methods.interestVotes(node).call());
          }
          const inflationOrder = nodes.slice().sort(comparator(inflationVote));
          const prizeOrder = nodes.slice().sort(comparator(prizeVote));
          const certificatesOrder = nodes.slice().sort(comparator(certificatesVote));
          const interestOrder = nodes.slice().sort(comparator(interestVote));

          await governance.methods.computeVote(
            inflationOrder,
            prizeOrder,
            certificatesOrder,
            interestOrder,
          )
            .send({ gas: 4000000 });
          return true;
        }
      } else if (await isAlive(inflationAddress)) {
        const inflation = new web3.eth.Contract(
          InflationABI.abi,
          inflationAddress,
          { from: this.account },
        );
        const seed = toBN(await inflation.methods.seed().call());
        const vdfSeed = toBN(await inflation.methods.entropyVDFSeed().call());
        const rootHash = await this.getRootHashContract(inflation);
        if (seed.isZero()) {
          if (vdfSeed.isZero()) {
            logger.info('comitting vdf seed');
            await inflation.methods.commitEntropyVDFSeed().send({ gas: 4000000 });
            return true;
          }
          logger.info('breaking random vdf');
          solveAndSubmitEntropy(
            governance,
            inflation,
            await inflation.methods.vdfVerifier().call(),
            vdfSeed,
            await inflation.methods.randomVDFDifficulty().call(),
            this.account,
          );
        } else if (!web3.utils.toBN(await rootHash.methods.acceptedRootHash()).call().eq(web3.utils.toBN('0'))) {
          const winners = toBN(await inflation.methods.winners().call()).toNumber();
          let allClaimed = true;
          for (let i = 0; i < winners; i += 1) {
            const claimed = await inflation.methods.claimed(i).call();
            allClaimed = allClaimed && claimed;
            if (!claimed) {
              const period = toBN(await inflation.methods.PAYOUT_PERIOD().call()).toNumber();
              const payStart = toBN(await inflation.methods.payoutPeriodStarts().call()).toNumber();
              const payOut = payStart + (period * i) / winners;
              if (payOut >= this.timeStamp) {
                break;
              } else {
                const [a, index, winner] = this.getClaimParameters(
                  rootHash._address,
                  bnHex(seed, 32),
                  i,
                );
                logger.info(`Paying winning ticket ${i} to ${winner}`);
                await inflation.methods.claimFor(
                  winner,
                  i,
                  a[1].reverse(),
                  a[0].sum.toString(),
                  index,
                ).send({ gas: 1000000 });
              }
            }
          }
          if (allClaimed) {
            logger.info('Destructs inflation');
            await inflation.methods.destruct().send({ gas: 4000000 });
            return true;
          }
        } else {
          await rootHash.methods.checkRootHashStatus(
            this.account,
          ).send({ gas: 1000000 });
        }
      } else if (await isAlive(certAddress)) {
        if (certAddress !== undefined && await web3.eth.getTransactionCount(certAddress) !== 0) {
          const deposit = new web3.eth.Contract(
            LockupContractABI.abi,
            certAddress,
            { from: this.account },
          );

          const lockupEnds = toBN(await deposit.methods.lockupEnds().call()).toNumber();
          if (lockupEnds < this.timeStamp) {
            const investors = (await deposit.getPastEvents('Sale', { fromBlock: 0, toBlock: 'latest' }))
              .map((x) => x.returnValues.to);

            for (let i = 0; i < investors.length; i += 1) {
              const investor = investors[i];
              const balance = toBN(await deposit.methods.depositBalances(investor).call());
              if (!balance.isZero()) {
                logger.info('Withdrawing for', investor);
                await deposit.methods.withdrawFor(investor).send({ gas: 1000000 });
                return true;
              }
            }

            logger.info('Destructing Deposits');
            await deposit.methods.destruct().send({ gas: 4000000 });
            return true;
          }
        }
      } else {
        logger.info(`forgetting ${address}`);
        this.currencyAddresses.delete(address);
        return true;
      }
    }
    return false;
  }

  async processBlockAsync() {
    const block = await web3.eth.getBlock('latest');
    this.blockNumber = block.number;
    this.timeStamp = block.timestamp;
    logger.info(`Processing ${this.blockNumber} ${new Date(this.timeStamp)}`);

    if (this.account === undefined) {
      [this.account] = await web3.eth.getAccounts();
    }

    const actionDone = await this.processTimedPolicies()
    || await this.processProposals()
    || await this.processRootHashProposals()
    || await this.processInflations();

    if (actionDone) {
      return true;
    }

    logger.info('No action');
    return false;
  }

  async processBlock() {
    const release = await this.mutex.acquire();
    try {
      await this.processBlockAsync();
    } finally {
      release();
    }
  }

  async processAllBlocks() {
    for (;;) {
      const block = await web3.eth.getBlockNumber();
      await this.processBlock();
      if (await web3.eth.getBlockNumber() === block) {
        return;
      }
    }
  }

  static async start(options = {}) {
    logger.info(`Running supervisor with options ${JSON.stringify(options)}`);

    const policyaddr = options.root;

    logger.info(`policyaddr: ${policyaddr}`);

    const s = new Supervisor(policyaddr, options.account);

    logger.info('Subscribing to newBlockHeaders');
    web3.eth.subscribe('newBlockHeaders', (error) => {
      if (error) {
        logger.error(error);
      }
    }).on('data', async (header) => {
      logger.info(`subscribed ${header.number} ${header.timestamp}`);
      await s.processBlock();
    }).on('error', async (e) => {
      logger.info(`Subscription returned error ${e}`);
      process.exit(1);
    });

    // Run initial catch-up
    await s.processAllBlocks();
  }
}

module.exports = {
  Supervisor,
};
