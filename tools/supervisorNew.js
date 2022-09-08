require('dotenv').config()
const web3 = require('web3')
const { ethers } = require('ethers')
const fs = require('fs')
const path = require('path')
const BN = require('bn.js')

const { BigNumber } = ethers

const PRIVATE_KEY = process.env.PRIVATE_KEY

/* eslint-disable no-console */
/* eslint-disable no-unused-vars */
/* eslint no-bitwise: 0 */
/* eslint-disable no-param-reassign, no-await-in-loop */
/* eslint-disable no-lone-blocks, no-underscore-dangle */

const {
  getTree,
  getPrimal,
  getClaimParameters,
  answer,
} = require('./randomInflationUtils')
const { prove, bnHex } = require('./vdf')

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

let provider
// const challengeIndex = 1

function getABI(filepath) {
  const filename = filepath.split('/').pop()

  try {
    // TODO: replace this fs stuff with a more explicit import
    return JSON.parse(
      fs.readFileSync(
        path.resolve(
          __dirname,
          `../artifacts/contracts/${filepath}.sol/${filename}.json`
        )
      )
    )
  } catch (e) {
    if (global.artifacts === undefined) {
      // logger.info(e);
      throw new Error("Run 'truffle compile'", e)
    }
    return artifacts.require(contract)._json
  }
}

let tx

// Contract ABIs and Bytecode
const PolicyABI = getABI('policy/Policy')
const ECO = getABI('currency/ECO')
const TimedPoliciesABI = getABI('governance/TimedPolicies')
const PolicyProposalsABI = getABI('governance/community/PolicyProposals')
const PolicyVotesABI = getABI('governance/community/PolicyVotes')
const TrustedNodesABI = getABI('governance/monetary/TrustedNodes')
const VDFVerifierABI = getABI('VDF/VDFVerifier')
const CurrencyGovernanceABI = getABI('governance/monetary/CurrencyGovernance')
const CurrencyTimerABI = getABI('governance/CurrencyTimer')
const InflationABI = getABI('governance/monetary/RandomInflation')
const InflationRootHashProposalABI = getABI(
  'governance/monetary/InflationRootHashProposal'
)

const ID_TIMED_POLICIES = web3.utils.soliditySha3('TimedPolicies')
const ID_CURRENCY_TIMER = web3.utils.soliditySha3('CurrencyTimer')
const ID_CURRENCY_GOVERNANCE = web3.utils.soliditySha3('CurrencyGovernance')
const ID_TRUSTED_NODES = web3.utils.soliditySha3('TrustedNodes')
// const ID_ERC20TOKEN = web3.utils.soliditySha3('ERC20Token');
const ID_ECO = web3.utils.soliditySha3('ECO')
const ID_POLICY_PROPOSALS = web3.utils.soliditySha3('PolicyProposals')
const ID_POLICY_VOTES = web3.utils.soliditySha3('PolicyVotes')

const { toBN } = web3.utils

// useful time constants
const MINUTE = 60
/* eslint-disable no-unused-vars */
const HOUR = 60 * MINUTE
// const DAY = 24 * HOUR;
// length of a generation
// this is the default value, overwritten by TimedPolices.GENERATION_DURATION
let GENERATION_TIME
const YEAR = GENERATION_TIME * 26

const BYTES32_0 =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
// time before next generation that auto refund is called
// 1 HOUR in normal generations, 3 MINUTES for helix
const REFUND_BUFFER = 2 * MINUTE

class Supervisor {
  constructor(policyAddr, signer) {
    this.signer = signer

    this.policy = new ethers.Contract(policyAddr, PolicyABI.abi, this.signer)

    this.balances = {}
  }

  async updateGeneration() {
    if (this.timestamp > this.nextGenerationStartTime) {
      console.log('UPDATING GENERATION!!!')
      await this.timedPolicies.incrementGeneration({ gasLimit: 2000000 })
      console.log('updated')
      // const prevStartBlock = this.currentGenerationStartBlock;
      this.currentGenerationStartBlock = this.blockNumber
      // await this.getTxHistory(prevStartBlock, this.currentGenerationStartBlock);
      this.currentGenerationStartTime = this.timestamp
      this.currentGeneration += 1
      this.nextGenerationStartTime =
        this.currentGenerationStartTime + GENERATION_TIME
    }
  }

  async updateContracts() {
    // called the block after generation update
    // fetches all the new contract addresses from the registry

    this.policyProposals = new ethers.Contract(
      await this.policy.policyFor(ID_POLICY_PROPOSALS),
      PolicyProposalsABI.abi,
      this.signer
    )
    console.log(`policyProposals address is: ${this.policyProposals.address}`)

    this.currencyGovernance = new ethers.Contract(
      await this.policy.policyFor(ID_CURRENCY_GOVERNANCE),
      CurrencyGovernanceABI.abi,
      this.signer
    )
    console.log(
      `currencyGovernance address is: ${this.currencyGovernance.address}`
    )

    this.trustedNodes = new ethers.Contract(
      await this.policy.policyFor(ID_TRUSTED_NODES),
      TrustedNodesABI.abi,
      this.signer
    )
    console.log(`trustedNodes address is: ${this.trustedNodes.address}`)
    this.yearEnd = (await this.trustedNodes.yearEnd()).toNumber()

    let filter = this.currencyTimer.filters.NewInflation()
    let events = await this.currencyTimer.queryFilter(
      filter,
      this.currentGenerationStartBlock,
      'latest'
    )
    if (events.length > 0) {
      const randomInflationAddress = events[events.length - 1].args[0]
      this.randomInflation = new ethers.Contract(
        randomInflationAddress,
        InflationABI.abi,
        this.signer
      )
      console.log(`randomInflation address is: ${this.randomInflation.address}`)

      filter = this.randomInflation.filters.InflationStart()
      events = await this.randomInflation.queryFilter(
        filter,
        this.currentGenerationStartBlock,
        'latest'
      )
      if (events.length > 0) {
        const startInflationEvent = events[events.length - 1]

        const vdfVerifierAddress = startInflationEvent.args[0]
        this.vdfVerifier = new ethers.Contract(
          vdfVerifierAddress,
          VDFVerifierABI.abi,
          this.signer
        )

        console.log(`VDFVerifier address is: ${this.vdfVerifier.address}`)

        const inflationRootHashProposalAddress = startInflationEvent.args[1]
        this.inflationRootHashProposal = new ethers.Contract(
          inflationRootHashProposalAddress,
          InflationRootHashProposalABI.abi,
          this.signer
        )

        console.log(
          `InflationRootHashProposal address is: ${this.inflationRootHashProposal.address}`
        )

        // const firstPass = Object.keys(this.gonsBalances)
        this.prevInflationBlockNumber = this.inflationBlockNumber
        this.inflationBlockNumber = (
          await this.inflationRootHashProposal.blockNumber()
        ).toNumber()
        console.log(this.inflationBlockNumber)
        if (!this.gonsBalances) {
          this.gonsBalances = {}
          this.getTxHistory(0, this.inflationBlockNumber)
        } else {
          this.getTxHistory(
            this.prevInflationBlockNumber,
            this.inflationBlockNumber
          )
        }
      }
    }
  }

  async manageCommunityGovernance() {
    await this.deployProposalVoting()

    await this.executeProposal()
  }

  async deployProposalVoting() {
    if (
      (await this.policyProposals.proposalToConfigure()) !== ZERO_ADDRESS &&
      (await this.policyProposals.proposalSelected())
    ) {
      console.log('deployPolicyVotes')
      tx = await this.policyProposals.deployProposalVoting({
        gasLimit: 20000000,
      })
      tx = await tx.wait()
      console.log(tx.status === 1)
      console.log('deployed policyVotes')
      console.log(await this.policy.policyFor(ID_POLICY_VOTES))

      this.policyVotes = new ethers.Contract(
        await this.policy.policyFor(ID_POLICY_VOTES),
        PolicyVotesABI.abi,
        this.signer
      )

      console.log(`policyVotes at: ${this.policyVotes.address}`)
    }
  }

  async executeProposal() {
    // this.policyVotes = new ethers.Contract(
    //   await this.policy.policyFor(ID_POLICY_VOTES),
    //   PolicyVotesABI.abi,
    //   this.signer
    // );
    if (this.policyVotes) {
      console.log('executeProposal')
      try {
        const requiredStake = (await this.policyVotes.totalStake()).div(2)
        console.log(`requiredStake = ${requiredStake}`)
        const yesStake = await this.policyVotes.yesStake()
        console.log(`yesStake      = ${yesStake}`)
        const executionTime =
          (await this.policyVotes.voteEnds()).toNumber() +
          (await this.policyVotes.ENACTION_DELAY()).toNumber()
        console.log(executionTime)
        console.log(this.timestamp)
        if (
          requiredStake > 0 &&
          yesStake > requiredStake &&
          this.timestamp > executionTime
        ) {
          console.log(`trying to execute winning policyProposal`)
          tx = await this.policyVotes.execute()
          tx = await tx.wait()
          if (tx.status === 1) {
            delete this.policyVotes
          }
        }
      } catch (e) {
        console.log(e)
      }
    }
  }

  // async refundUnselectedProposals() {
  //   // do refunds of unselected proposals
  //   const numProposals = (await this.policyProposals.totalProposals()).toNumber();
  //   const allProps = await this.policyProposals.getPaginatedProposalAddresses(
  //     1,
  //     numProposals+1
  //   );
  //   for (const proposal of allProps) {
  //     await this.policyProposals.refund(proposal);
  //   }
  // }

  async manageCurrencyGovernance() {
    // updates the stage of the currency governance process

    const stage = await this.currencyGovernance.currentStage()
    console.log(`currency governance is at stage ${stage}`)

    if (
      (stage === 0 &&
        this.timestamp >=
          (await this.currencyGovernance.proposalEnds()).toNumber()) ||
      (stage === 1 &&
        this.timestamp >=
          (await this.currencyGovernance.votingEnds()).toNumber()) ||
      (stage === 2 &&
        this.timestamp >=
          (await this.currencyGovernance.revealEnds()).toNumber())
    ) {
      await this.currencyGovernance.updateStage()
      console.log(
        `stage updated to ${await this.currencyGovernance.currentStage()}`
      )
    } else if (stage === 3) {
      await this.currencyGovernance.compute()
    }

    // call annualUpdate if it has been a year
    // console.log(`year end is at: ${this.yearEnd}`);
    // console.log(`timestamp is at: ${this.timestamp}`);

    if (this.yearEnd && this.timestamp > this.yearEnd) {
      console.log('attempting annual update')
      tx = await this.trustedNodes.annualUpdate({ gasLimit: 20000000 })
      tx = await tx.wait()
      if (tx.status === 1) {
        this.yearEnd = await this.trustedNodes.yearEnd()
        console.log('annualUpdate')
      }
    }
  }

  async manageRandomInflation() {
    console.log('managing random inflation')
    // VDF
    const seed = BigNumber.from(await this.randomInflation.seed())
    // let seed = BigNumber.from('0');
    // console.log(seed);
    if (seed.eq(BigNumber.from(0))) {
      console.log('vdf flow!')
      await this.vdfFlow()
    } else if (
      (await this.inflationRootHashProposal.acceptedRootHash()) === BYTES32_0
    ) {
      console.log('RHP time')
      await this.inflationRootHashProposalFlow()
    } else {
      console.log(
        `accepted rhp: ${await this.inflationRootHashProposal.acceptedRootHash()}`
      )
      // const numRecipients = (
      //   await this.randomInflation.numRecipients()
      // ).toNumber()
      // const stuff = await this.fromBalances(this.balances)
      // const tree = stuff[0]
      // const orderedAddresses = stuff[1]
      // const orderedBalanceSums = stuff[2]
      // const totalSum = stuff[3]

      // for (let seqNo = 0; seqNo < numRecipients; seqNo++) {
      //   const params = await getClaimParameters(
      //     seed,
      //     tree,
      //     seqNo,
      //     totalSum,
      //     orderedBalanceSums,
      //     orderedAddresses
      //   )
      //   const ans = params[0]
      //   const proof = ans[1].reverse()
      //   const leafSum = ans[0].sum.toString()
      //   const index = params[1]
      //   const recipient = params[2]
      //   console.log(recipient)
      //   console.log(seqNo)
      //   console.log(proof)
      //   console.log(leafSum)
      //   console.log(index)

      //   try {
      //     if (recipient === (await this.signer.getAddress())) {
      //       tx = await this.randomInflation.claim(
      //         seqNo,
      //         proof,
      //         leafSum,
      //         index,
      //         { gasLimit: 20000000 }
      //       )
      //       tx = await tx.wait()
      //       console.log(
      //         `it is ${
      //           tx.status === 1
      //         } that we just claimed RI seqNo ${seqNo} for address ${recipient}`
      //       )
      //     } else {
      //       tx = await this.randomInflation.claimFor(
      //         recipient,
      //         seqNo,
      //         proof,
      //         leafSum,
      //         index,
      //         { gasLimit: 20000000 }
      //       )
      //       tx = await tx.wait()
      //       console.log(
      //         `it is ${
      //           tx.status === 1
      //         } that we just claimed RI seqNo ${seqNo} for address ${recipient}`
      //       )
      //     }
      //   } catch (e) {
      //     console.log(e)
      //   }
      // }
    }
  }

  // VDF flow
  async vdfFlow() {
    let vdfSeed = await this.randomInflation.entropyVDFSeed()
    vdfSeed = new BN(vdfSeed.toHexString().slice(2), 16)
    console.log(vdfSeed)
    // let filter = this.randomInflation.filters.EntropyVDFSeedCommit();
    // const events = await this.randomInflation.queryFilter(filter, -20);
    // console.log(events);
    if (vdfSeed.eq(new BN('0'))) {
      if (!this.primal) {
        console.log('trying to get primal')
        const primalTry = await getPrimal(
          (
            await provider.getBlock(this.blockNumber)
          ).hash
        )
        tx = await this.randomInflation.setPrimal(primalTry, {
          gasLimit: 20000000,
        })
        tx = await tx.wait()
        console.log(tx.status === 1)
        console.log(primalTry)
        this.primal = primalTry
      } else {
        // commit entropyVDFSeed
        console.log('trying to commit entropyVDFSeed')
        tx = await this.randomInflation.commitEntropyVDFSeed(this.primal, {
          gasLimit: 20000000,
        })

        tx = await tx.wait()
        console.log(tx.status === 1)
        // try {
        //   await this.randomInflation.commitEntropyVDFSeed(this.primal, {
        //     gasLimit: 20000000,
        //   });
        //   console.log('committed entropyVDFseed');
        // } catch(e) {
        //   console.log(e);
        // }
      }
    } else {
      this.t = (await this.randomInflation.randomVDFDifficulty()).toNumber()
      ;[this.y, this.Usqrt] = await prove(vdfSeed, this.t)

      if (
        !(await this.vdfVerifier.isVerified(
          bnHex(vdfSeed),
          this.t,
          bnHex(this.y)
        ))
      ) {
        if (!this.vdfStarted) {
          // start VDF verification
          console.log('vdf started')
          this.t = (await this.randomInflation.randomVDFDifficulty()).toNumber()
          ;[this.y, this.Usqrt] = await prove(vdfSeed, this.t)
          tx = await this.vdfVerifier.start(
            bnHex(vdfSeed),
            this.t,
            bnHex(this.y),
            { gasLimit: 20000000 }
          )
          tx = await tx.wait()
          console.log(tx.status === 1)
          this.vdfStarted = true
          // this.vdfi = 0;
          // } else if (this.vdfi < this.t - 1) {
          //   // update
          //   try {
          //     const u = this.Usqrt[this.vdfi];
          //     await this.vdfVerifier.update(bnHex(u));
          //     console.log('update');
          //     this.vdfi++;
          //   } catch (e) {
          //     console.log(e)
          //   }
          // } else {
          //   //done updating
          //   console.log('finished VDF updates');
          //   if (await this.vdfVerifier.isVerified(this.primal, this.t, this.y)) {
          //     await this.randomInflation.submitEntropyVDF();
          //     console.log('vdf done!');
          //   } else {
          //     console.log('VDF failure - try again w new primal');
          //     this.primal = 0;
          //     this.vdfStarted = false;
          //     this.vdfi = 0
          //   }
        } else {
          // update until exit --> verified or failed
          console.log('verifying vdf')
          for (let i = 0; i < this.t - 1; i += 1) {
            const u = this.Usqrt[i]
            // vdfTrace(`u     ${i + 1}: ${bnHex(u)}`);

            // if (!seenShorterU && u.bitLength() < n.bitLength()) {
            //   seenShorterU = true;
            //   vdfTrace(`Seen log2(u)=${u.bitLength()} < log2(n)=${n.bitLength()}`);
            // }
            // result = await instanceVDFVerifier.update(bnHex(u));
            tx = await this.vdfVerifier.update(bnHex(u), { gasLimit: 20000000 })
            tx = await tx.wait()
            console.log(`update ${i}`)
            // receipt = await result.wait();
            // vdfTrace(`update: gas used ${receipt.gasUsed}`);
            // totalGasInVerify += Number(receipt.gasUsed);
          }
        }

        try {
          tx = await this.randomInflation.submitEntropyVDF(bnHex(this.y), {
            gasLimit: 20000000,
          })
          tx = await tx.wait()
          console.log(tx.status === 1)
          console.log('vdf done!')
        } catch (e) {
          // failure somewhere in the process
          console.log('VDF failure - try again w new primal')
          this.primal = 0
        }
      }
      console.log('vdf is verified!')
      tx = await this.randomInflation.submitEntropyVDF(bnHex(this.y), {
        gasLimit: 20000000,
      })
      tx = await tx.wait()
      console.log(tx.status === 1)
      console.log('vdf done!')
    }
  }

  async inflationRootHashProposalFlow() {
    const acct = await this.signer.getAddress()
    console.log(acct)
    // this.challenged = true
    // this.responded = true
    if (
      !(await this.inflationRootHashProposal.rootHashProposals(acct))
        .initialized
    ) {
      // if  no RHP exists, propose it
      console.log('propose root hash')
      // allow inflationRootHashProposal contract to transfer PROPOSER_FEE
      await this.eco.approve(
        this.inflationRootHashProposal.address,
        (await this.inflationRootHashProposal.PROPOSER_FEE()).toString()
      )
      this.proposeRootHash()
    } else if (!this.challenged) {
      this.challenged = true
      // for testing
      // console.log('challenge flow')

      // const signer2 = new ethers.Wallet(
      //   '0x1cf512b19a7355113c191f3c4306796a3cf75d3d7dfe07e3587ada8a17f3d629',
      //   provider
      // )
      // const eco2 = new ethers.Contract(this.eco.address, ECO.abi, signer2)
      // const inflationRootHashProposal2 = new ethers.Contract(
      //   this.inflationRootHashProposal.address,
      //   InflationRootHashProposalABI.abi,
      //   signer2
      // )

      // // challenge

      // tx = await eco2.approve(
      //   inflationRootHashProposal2.address,
      //   (await inflationRootHashProposal2.CHALLENGE_FEE()).toString()
      // )
      // tx = await tx.wait()
      // console.log(tx.status === 1)

      // console.log(challengeIndex)

      // tx = await inflationRootHashProposal2.challengeRootHashRequestAccount(
      //   await this.signer.getAddress(),
      //   challengeIndex,
      //   { gasLimit: 20000000 }
      // )
      // tx = await tx.wait()
      // console.log(tx.status === 1)
    } else if (!this.responded) {
      // rhp exists
      const rootHashProposal =
        await this.inflationRootHashProposal.rootHashProposals(acct)
      if (rootHashProposal.status === 0) {
        // status is pending
        console.log('responding to rhp challenges')
        console.log(
          `you have ${await this.inflationRootHashProposal.CONTESTING_TIME()} seconds to respond`
        )
        // respond to challenges
        const filter =
          this.inflationRootHashProposal.filters.RootHashChallengeIndexRequest(
            acct,
            null,
            null
          )
        const challengeEvents =
          await this.inflationRootHashProposal.queryFilter(
            filter,
            this.currentGenerationStartBlock,
            'latest'
          )
        console.log(`found ${challengeEvents.length} challenge events`)

        for (let i = 0; i < challengeEvents.length; i++) {
          const challenge = challengeEvents[i]
          const tree = (await this.fromBalances(this.balances))[0]
          const ans = answer(tree, challenge.args.index)
          tx = await this.inflationRootHashProposal.respondToChallenge(
            challenge.args.challenger,
            ans[1].reverse(),
            ans[0].account,
            BigNumber.from(ans[0].balance.toString()),
            BigNumber.from(ans[0].sum.toString()),
            challenge.args.index,
            { gasLimit: 20000000 }
          )
          tx = await tx.wait()
          if (tx.status === 1) {
            console.log('successful challenge response')
            this.responded = true
          }
        }
      }
    } else {
      // remove this eventually
      const rootHashProposal =
        await this.inflationRootHashProposal.rootHashProposals(acct)
      console.log(rootHashProposal.lastLiveChallenge.toNumber())
      console.log(rootHashProposal.newChallengerSubmissionEnds.toNumber())
      console.log(this.timestamp)
      if (
        this.timestamp > rootHashProposal.lastLiveChallenge.toNumber() &&
        this.timestamp > rootHashProposal.newChallengerSubmissionEnds.toNumber()
      ) {
        tx = await this.inflationRootHashProposal.checkRootHashStatus(acct)
        tx = await tx.wait
        if (tx.status === 1) {
          console.log(`root hash proposal accepted`)
        }
      }
    }
  }

  async fromBalances(balancesMap) {
    const arrayOfMap = []
    const orderedBalanceSums = []
    let totalSum = toBN('0')
    const orderedAddresses = Object.keys(balancesMap).sort()
    // console.log(orderedAddresses.length);
    for (const a of orderedAddresses) {
      // console.log(entry[1]);
      orderedBalanceSums.push(totalSum)
      const bal = balancesMap[a]
      totalSum = await totalSum.add(bal)
      arrayOfMap.push([a, bal])
    }
    // console.log(orderedAddresses)
    // console.log(orderedBalanceSums.map( x => x.toString()))

    const tree = await getTree(arrayOfMap)
    return [tree, orderedAddresses, orderedBalanceSums, totalSum]
  }

  async proposeRootHash() {
    const arrayOfMap = []
    let totalSum = toBN('0')

    for (const entry of Object.entries(this.balances)) {
      // console.log(entry[1]);
      totalSum = await totalSum.add(entry[1])
      arrayOfMap.push(entry)
    }
    // console.log(totalSum);
    this.tree = await getTree(arrayOfMap)
    const numAccounts = arrayOfMap.length
    tx = await this.inflationRootHashProposal.proposeRootHash(
      this.tree.hash,
      totalSum.toString(),
      numAccounts,
      { gasLimit: 2000000 }
    )

    tx = await tx.wait()
    console.log(tx.status === 1)
    console.log('roothash proposed!')
  }

  async catchup() {
    // set up supervisor

    // these contracts only need be declared once, they are hosted on proxies
    this.timedPolicies = new ethers.Contract(
      await this.policy.policyFor(ID_TIMED_POLICIES),
      TimedPoliciesABI.abi,
      this.signer
    )
    console.log(`timedpolicies address is: ${this.timedPolicies.address}`)

    this.currencyTimer = new ethers.Contract(
      await this.policy.policyFor(ID_CURRENCY_TIMER),
      CurrencyTimerABI.abi,
      this.signer
    )
    console.log(`currencyTimer address is: ${this.currencyTimer.address}`)

    this.eco = new ethers.Contract(
      await this.policy.policyFor(ID_ECO),
      ECO.abi,
      this.signer
    )
    console.log(`ECO address is: ${this.eco.address}`)

    const filter = this.timedPolicies.filters.NewGeneration()
    const events = await this.timedPolicies.queryFilter(filter, 0, 'latest')
    const newGenerationEvent = events[events.length - 1]
    this.currentGeneration = newGenerationEvent.args[0]
    this.currentGenerationStartBlock = newGenerationEvent.blockNumber
    const block = await provider.getBlock(this.currentGenerationStartBlock)
    this.currentGenerationStartTime = block.timestamp
    GENERATION_TIME = (
      await this.timedPolicies.GENERATION_DURATION()
    ).toNumber()
    this.nextGenerationStartTime =
      this.currentGenerationStartTime + GENERATION_TIME

    console.log(
      `SUPERVISOR STARTED. CURRENT GENERATION STARTED AT TIME: ${this.currentGenerationStartTime} ON BLOCK: ${this.currentGenerationStartBlock}\n`
    )

    await this.updateContracts()

    // move this to updateContracts, iff randomInflation exists, and use the blockNumber found in randomInflation to do it
  }

  async getTxHistory(startBlock, endBlock) {
    console.log('getting tx history')
    const filter = this.eco.filters.BaseValueTransfer()
    const events = await this.eco.queryFilter(filter, startBlock, endBlock)
    events.forEach((event) => {
      const args = event.args
      if (!toBN(args.from).eq(toBN('0')) && !toBN(args.value).eq(toBN('0'))) {
        this.gonsBalances[args.from.toLowerCase()] = this.gonsBalances[
          args.from.toLowerCase()
        ].sub(toBN(args.value))
      }
      if (this.gonsBalances[args.to.toLowerCase()] === undefined) {
        this.gonsBalances[args.to.toLowerCase()] = toBN(args.value)
      } else {
        this.gonsBalances[args.to.toLowerCase()] = this.gonsBalances[
          args.to.toLowerCase()
        ].add(toBN(args.value))
      }
    })

    // apply appropriate inflationMultiplier
    const infMultiplier = toBN(
      (await this.eco.getPastLinearInflation(endBlock)).toString()
    )
    console.log(infMultiplier)
    for (const entry of Object.entries(this.gonsBalances)) {
      if (entry[1].isZero()) {
        continue
      }
      this.balances[entry[0]] = entry[1].divmod(infMultiplier, 'div', true).div
    }

    // balances have been updated
  }

  async processBlock() {
    const block = await provider.getBlock('latest')
    this.blockNumber = block.number
    this.timestamp = block.timestamp
    const drift = Math.abs(Math.floor(Date.now() / 1000) - this.timestamp)
    if (drift > 300) {
      // pretty primitive logging here, but it'll work for now
      const content = `current timestamp: ${Math.floor(
        Date.now() / 1000
      )}, block timestamp: ${this.timestamp}, drift: ${drift}`
      fs.writeFile('tools/timedrift.txt', content, (e) => {
        if (e) {
          console.log(e)
        }
      })
    }
    if (this.blockNumber % 1 === 0) {
      if (this.timestamp > this.nextGenerationStartTime) {
        // if (false) {
        await this.updateGeneration()
        console.log(
          `current time is ${this.timestamp}, nextGenerationStartTime is ${this.nextGenerationStartTime}, updating generation`
        )
        console.log(
          `current generation block is ${this.currentGenerationStartBlock}, this.blockNumber is ${this.blockNumber}, updating contracts`
        )
      } else if (this.blockNumber === this.currentGenerationStartBlock + 1) {
        await this.updateContracts()
      } else if (this.blockNumber > this.currentGenerationStartBlock + 1) {
        console.log('managing currency governance')
        await this.manageCurrencyGovernance()
        console.log('managing community governance')
        await this.manageCommunityGovernance()

        if (this.randomInflation) {
          await this.manageRandomInflation()
        }
      }
    }
    console.log(`done with block ${this.blockNumber}`)
  }

  static async start(_jsonrpcProviderString, _rootPolicy, signer) {
    if (!_jsonrpcProviderString) {
      // local testing
      provider = await ethers.getDefaultProvider()
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
      signer = wallet.connect(provider)
      // signer = wallet.connect(provider);
      console.log(signer)
    } else {
      provider = new ethers.providers.JsonRpcProvider(_jsonrpcProviderString)
      if (!signer) {
        // if (_jsonrpcProviderString.includes('localhost')) {
        //   signer = await provider.getSigner();
        // } else {
        //   const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
        //   signer = wallet.connect(provider);
        // }
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider)
        signer = wallet.connect(provider)
        // console.log(signer);
      }
    }
    const supervisor = await new Supervisor(_rootPolicy, signer)

    await supervisor.catchup()

    console.log('CAUGHT UP')

    provider.on('block', () => {
      supervisor.processBlock()
    })
  }

  // static async start(_jsonrpcProviderString, _rootPolicy) {
  //   provider = new ethers.providers.JsonRpcProvider(_jsonrpcProviderString);
  //   let signer = null;
  //   if (_jsonrpcProviderString.includes('localhost')) {
  //     signer = await provider.getSigner();
  //   } else {
  //     const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  //     signer = wallet.connect(provider);
  //   }

  //   const supervisor = await new Supervisor(_rootPolicy, signer);

  //   await supervisor.catchup();

  //   console.log('CAUGHT UP');

  //   provider.on('block', () => {
  //     supervisor.processBlock();
  //   });
  // }

  static async setup(testArgs) {
    let rpc
    let rootPolicy
    let signer
    if (testArgs) {
      console.log('testargs')
      rpc = testArgs[0]
      rootPolicy = testArgs[1]
      signer = testArgs[2]
    } else {
      console.log('no testargs')
      let args = fs.readFileSync('tools/supervisorInputs.txt')
      args = args.toString().split('\n')
      rpc = args[0]
      rootPolicy = args[1]
      signer = null
    }

    Supervisor.start(rpc, rootPolicy, signer)
  }
}

// let args = fs.readFileSync('tools/supervisorInputs.txt');
// args = args.toString().split('\n');
// const rpc = args[0];
// const rootPolicy = args[1];

// console.log(rpc);
// console.log(rootPolicy);

// Supervisor.start(rpc, rootPolicy);

module.exports = {
  Supervisor,
}
