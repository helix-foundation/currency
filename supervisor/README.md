# Eco Governance Supervisor
This implements the Eco Governance Supervisor, a set of typescript objects smoothing the governance processes of the Eco Currency System. 

## Table of Contents
 -[Building](#building)
 -[Security](#security)
 -[Background](#background)
 -[API](#security)

## Building
To build the docker image for the supervisor:
```
docker build .
```

Build and tag the image:
```
docker build -t  beamnetwork/supervisor:0.0.2 .
```

Push the image to docker hub:
```
docker image push beamnetwork/supervisor:0.0.2
```

To run the image, you need to have the variables in [.env.example](.env.example) or pass them in to the run command:
```
docker run -p 3000:8080 -e PRIVATE_KEY=<privatekey>  -e INFURA_URL=https://goerli.infura.io/v3/<key> -e POLICY_ROOT=<policyRootAddress> <imageID>
```

## Security
Since the Supervisor is not privileged, it cannot affect system state in any way beyond how a traditional EOA can, and therefore does not present an additional attack surface at a contract level. The Eco Foundation will be funding the Supervisor and will using the most advanced key management tools to maintain  its integrity.


## Background
The Supervisor is a tool that calls governance functions that users may not be incentivized to call, like incrementing the generation, or deploying community governance voting. Notably, the Supervisor does not have any privileges not already afforded to EOAs - any call it makes could be made by any community member, and it cannot act as a trustee. It exists as a public good to help push governance forward while reducing costs to users.

The Supervisor consists of several component 'governors' united by one master 'supervisor'. Each governor manages the actions of one governance process, and the master supervisor is responsible for starting the governors and linking them together. The governors are as follows:

- TimeGovernor: responsible for large-timescale operations like generation update and trustee payout windows
- CommunityGovernor: responsible for community governance stages
- CurrencyGovernor: responsible for currency governance stages
- InflationGovernor: responsible for setup for random inflation + proposing a root hash

## API

### Master Supervisor
The master supervisor is responsible for parsing the config files and initializing all the governors with the correct wallet, provider and root policy address. If a config file is used, it will provide information on both the policy and signer. Providing a Policy and Signer and no config file results in a test deploy of the master supervisor. 

#### startTestSupervisor
Arguments: 
    - `policy` (Policy) (optional) - the root policy of the eco ecosystem to be referenced by the supervisor.
    - `signer` (ethers.Signer) (optional) - the signer from which the supervisor's wallet will be constructed.

This method starts the supervisor for a test environmnet. Should be called immediately upon construction. The filepath input is to be used for production cases, and the policy and signer are used primarily in testing. Policy and signer will not be used if filepath arg exists.

#### startGovernors
Arguments: None

This method deploys the various governors.

#### killAllListeners
Arguments: None

This method kills all block listeners and all the listeners in the currencyGovernor, communityGovernor and inflationGovernor.


### TimeGovernor
The TimeGovernor manages generation increment and the trustee payout schedule. 
Its purpose is to make timely calls to timedPolicies.incrementGeneration() and trustedNodes.annualUpdate(). The timing is managed by querying the contracts for the correct times and then listening to each block and checking the current timestamp against those times. 

#### setup
Arguments: None

This method fetches the timedPolicies and trustedNodes contracts and sets the governor's values for nextGenStart, generation and yearEnd.

#### startListener
Arguments: None

This method subscribes genUpdateListener to be called on every new block.

#### genUpdateListener
Arguments: None

This method checks the block time against the timedPolicies' nextGenerationStart and then attempts to increment the generation. If incrementGeneration() succeeds, it updates the timeGovernor's nextGenStart value. If it fails, it checks if the generation was updated by someone else in the interim, updating the nextGenStart value if so

#### annualUpdateListener
Arguments: None

This method, called every block, checks timing requirements and then makes a call to TrustedNodes.annualUpdate. In the event of the call's failure, an error is logged and the listener will retry the call again in the next block. 


### CommunityGovernor
The CommunityGovernor manages the community governance process and transitions it between its different phases. It is responsible for deploying a policyVotes instance, as well as executing a proposal if the votes allow for it. Notably, the CommunityGovernor does not 'fast-track' proposals - even if a given proposal is selected and the corresponding vote garners > 50% of the total voting power, the supervisor will only deploy it at the end of voting time, not before.

#### setup
Arguments: None

This method links the current timedPolcies, policyProposals and policyVotes contracts at the time of the CommunityGovernor's instantiation.

#### startListeners
Arguments: None

This method subscribes newPolicyProposalsListener, deployProposalVotingListener, fetchPolicyListener and executePolicyListener to their respective events.

#### deployProposalVotingListener
Arguments: None

This method calls deployProposalVoting upon seeing the SupportThresholdReached event. In the event of a failure in deployProposalVoting, the error is logged and the call is retried.

#### fetchProposalVotingListener
Arguments: policyVotesAddress (string) - the address of the PolicyVotes contract that was just deployed

This method fetches the address of the current PolicyVotes Contract.

#### executePolicyListener
Arguments: None

This method, called on every block, attempts to call execute() if the time and staking requirements are met. Upon success, it sets the hasExecuted flag to true.

#### killListeners
Arguments: None

This method kills the listeners for supportThresholdReached and voteStart.

#### newPolicyProposalsListener
Arguments: policyProposalsAddress (string) - the address of the PolicyProposals contract for the new generation

This method calls killListeners, sets the current PolicyProposals contract for the Community Governor and creates new listeners.


### CurrencyGovernor
The CurrencyGovernor manages currency governance stages. Its purpose is to make timely calls to currencyGovernance.updateStage(), and making sure that it makes this call to the correct adress, as a new instance of CurrencyGovernance is deployed every generation. 

#### setup
Arguments: None

This method fetches the timedPolicies and currencyGovernance contracts and sets the governor's values for proposalEnds, votingEnds and stage. 

#### startListeners
Arguments: None

This method subscribes stageUpdateListener to block events and newCurrencyGovernanceListener to timedPolicies' newGeneration events.

#### killListeners
Arguments: None

This method unsubscribes the listener for timedPolicies.NewGeneration. It is supposed to also unsubscribe the stageUpdateListener from block events, but temporarily unsubscribes all listeners from block events due to a difficulty with removing individual listeners

#### stageUpdateListener
Arguments: None

This method checks the stage and current timestamp and attempts to call currencyGovernance.updateStage(), and is only called if the current stage and timestamp are appropriate. If the call succeeds, the CurrencyGovernor's stage value is updated. If it fails, it checks to see if the stage has been updated already by someone else, setting the CurrencyGovernor's stage value if so. 

#### newCurrencyGovernanceListener
Arguments: None

This method fetches the new currencyGovernance instance and calls setup() set supervisor values.

### InflationGovernor
The InflationGovernor manages the randomInflation process. This includes setting the vdf seed, proposing a root hash, and defending that root hash against potential challenges. The voting power balances used in the calculation of root hash are pulled from a subgraphs endpoint.

#### setup
Arguments: None

This method fetches the timedPolicies, currency timer and ECO contracts.

#### startListeners
Arguments: None

On every currencyTimer.NewInflation event this method makes a call to startRIprocess

#### startRIProcesses

this method sets the InflationGovernor's randomInflation, inflationRootHashProposal and vdfVerifier attributes and calls spawnListeners and proposeRootHash.


#### startRIInstanceListeners
Arguments: None

This method is called every time a new randomInflation is started. It creates one-time subscriptions of proveVDF to the randomInflation.EntropyVDFSeedCommit event and submitVDF to the vdfVerifier.SuccessfulVerification event. Additionally, it creates a filter that calls respondToChallenge every time there is a challenge to a challenge to a root hash proposed by the InflationGovernor.

#### killListeners
Arguments: None

This method unsubscribes all the listeners set for InflationGovernor.

#### commitVdfSeed
Arguments: None

This method fetches a primal using the current blockHash and attempts to call randomInflation.setPrimal() and randomInflation.commitVdfSeed(). If the setPrimal() call fails, it aborts and tries again. If the setPrimal and commit calls succeed, it sets the InflationGovernor attribute vdfSeed. 

#### proveVDF
Arguments: None

This method attempts to prove a VDFseed that has been committed. It does this using the prove method from the vdf library. If the proof is successfully verified by vdfVerifier it sets the vdfOutput attribute, if it fails verification it logs an error and calls commitVdfSeed again. 

#### submitVDF
Arguments:
    - output (ethers.ethers.utils.Bytes) - the bytes output from the vdfVerifier

This method submits the verified VDF output generated in proveVDF. 

#### proposeRootHash
Arguments:
    - sortedBalances([string, ethers.BigNumber][])

This method takes in an array of [address, balance] sorted balances and uses it to propose a rootHash. The sortedBalances array is used to generate values for totalSum and numAccts, and the getTree method (from randomInflationUtils) generates a root hash. These three comprise the inputs to proposeRootHash. 
If proposeRootHash() fails, it retries it after a timeout. 

#### respondToChallenge
Arguments:
    - challenger (string) - address that submitted the challenge being responded to
    - index (number) - the index of the account being challenged

This method responds to any challenges to the root hash proposed by the InflationGovernor. Theoretically all challenges should be refutable, since the root hash will be honest, so if the respondToChallenge command fails it will be retried. 

#### fetchBalances
Arguments:
    - block (number) - the block number of the desired snapshot
    - subgraphURI (string) - the uri of the subgraphs endpoint to query for the snapshot

This method fetches the voting power snapshot at a specific blockNumber `block` from the subgraph endpoint at `subgraphURI`

#### balanceInflationAdjustment
Arguments:
    - accountSnapshotQuery (ECO_SNAPSHOT.EcoSnapshotQueryResult) - the query result from a subgraphs balance query

This method takes in the result of the subgraph query and adjusts the snapshot voting power for the current inflation, and also sorts the corresponding [address, balance] alphabetically by address
