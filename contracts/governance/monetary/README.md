# Monetary Governance System
> Monetary governance policies for the Eco currency.

These contracts provide the monetary policy system for the Eco currency. They specify how the currency is to be managed, and what economic processes are enacted.

## Table of Contents
  - [Security](#security)
  - [Background](#background)
  - [Install](#install)
  - [Usage](#usage)
  - [API](#api)
  - [Contributing](#contributing)
  - [License](#license)

## Security
The security of the governance contracts is built on a list of trustees. See the `TrustedNodes` contract for how the list maintained. Changes to the list of trustees can be only be made using policy proposals, and require the support of a majority of participating voters, weighted by stake.

## Background
The trustee and monetary governance contracts provide an iterating economic system. It allows Eco's trustees (a list of which is managed by the `TrustedNodes` contract) to enact inflationary or deflationary measures.

The `CurrencyGovernance` contract implements the governmental decisionmaking process, and records the results of the vote for the [CurrencyTimer](../README.md#currencytimer) contract to enact. Only the trustees may participate in the `CurrencyGovernance` contract's proposal and voting process.

The `TrustedNodes` contract manages the list of trustees as well as their rewards for participation in the monetary policy votes. The list of trusted nodes can be updated in a couple of different ways and there are example proposals in the [community governance](../community/) folder to show some suggested paths.

### Monetary Policy Decisions
The rest of the contracts are implementations of monetary Policy decisions. They're used to create and distribute new currency (to drive spending), to create and distribute lockup contracts (to discourage spending). Additionally, trustees may scale the currency across the board (to manage exchange value with other currencies), but this process is managed by the `ECO` contract. The different policy levers are designed to reward different behavior and provide incentives to achieve their desired results.

#### Random Inflation
A random inflation policy decision creates new currency and distributes it randomly to anyone who had votable ECO (not ECOx) at the end of the last generation. No registration is required, and probability of receiving a share of the newly minted currency is weighted by balance held.

#### Lockups
Deflation (or a similar slowing of the economy) is achieved by issuing lockup contracts that produce more ECO. These lockups are made available for a 48 hour window after the generation starts, and the participants receive newly created currency as rewards for their deposits when they retrieve their funds at the end of the lockup duration.

#### Linear Inflation/Deflation
This policy lever scales the balance for every single address by the same percentage amount. It increases or decreases the total supply while leaving the relative purchasing power of each user, relative to each other, the same. This can be used to change the unit value of ECO when compared to other currencies as an example. See the [InflationCheckpoints](../../currency/README.md#inflationcheckpoints) contract for documentation.

## Install
See the [main README](../../../README.md) for installation instructions.

## Usage
The governance contracts deploy as a policy hierarchy implemented in Eco's [policy framework](../policy/README.md). The [CurrencyTimer](../README.md#currencytimer) contract clones all the relevant contracts each generation to manage and enact the different policies.

The `CurrencyGovernance` contract is cloned to run the decisionmaking process. This process runs in 3 phases. First is a 10 day period over which trustees each can submit their proposals for new values for the 3 monetary policy levers. Then there is a 3 day phase in which the trustees create ballots ranking the proposals using a partial Borda Count method and submit them in the form of a hash commit. Finally there is a 1 day phase where votes are revealed and counted ending in a winner being chosen and applied as the next generation starts.

## API

### CurrencyGovernance
  - Inherits: `PolicedUtils`, `TimeUtils`, `Pausable`

This is the trustee monetary policy decision-making contract. It acts as a venue to both propose and vote on policy decisions. It is cloned for use by the `CurrencyTimer` contract and most of its functionality only works if cloned, denoting an active voting process whose progress is tracked in the `stage`  enum which denotes the phase of the voting.

Proposals are submitted by trustees calling `propose` with their desired values for the different monetary policy levers. These proposal structs are stored in the mapping `proposals` which maps the submitting trustee address (the key for the proposal for the whole voting process) to the struct that holds their proposed values. Trustees my withdraw and modify their proposals at any point during the `Propose` phase. Along with the proposed votes, a 'default proposal'  exists that enacts no change to the currency.

Once the `Propose` stage (first 10 days of a generation) completes, the submitted proposals move on to a partial Borda voting phase. A Borda vote is one where the voter submits a ranked choice ballot ranking all of the options. Then each choice is given n - i votes where n is the number of options and i is the position on the ballot (rank first is i = 0, ranked second is i = 1 and so on). In the partial Borda vote, the calculation is similar, except the voter my rank as many options as they choose, and then n is instead the number of options that were ranked on the submitted ballot. As a default, all trustees are considered to have an initial single vote for the default proposal. This default vote is replaced by their submitted vote if they successfully submit and reveal.

Votes are submitted via a hash commit of an ordered list of addresses corresponding to each proposal (its submitter, as specified above). One the 3 day period for submitting vote hash commits is done, the trustees must reveal their votes by calling `reveal` with a list of addresses that matches their hash commit. During this period, the `leader` variable, storing the address that corresponds to the leading proposal is updated on each reveal. The leader is selected as the proposal with the most votes. In case of a tie, the leader would be the proposal that has the greatest number of points in the previous vote and is tied in the current. 

The reveal phase is followed by a 1 day compute phase that finalizes the `winner` in an event and moves the contract into a dormant, `Finished` `stage`. The contract is thereon forward used as a lookup point for the values of the winning proposal.

#### Events

##### ProposalCreation
Attributes:
  - `trusteeAddress` (address) - address of the trustee that created this proposal.
  - `_numberOfRecipients` (uint256) - number of random inflation recipients for this
    proposal.
  - `_randomInflationReward` (uint256) - total reward to be awarded to randomInflation
    recipients.
  - `_lockupDuration` (uint256) - duration of lockup period.
  - `_lockupInterest` (uint256) - interest earned by keeping funds locked up for the
    full lockup period.
  - `_inflationMultiplier` (uint256) - new inflation multiplier to be applied to all
    balances.
  - `_description` (string) - description of the proposal

Indicates that a new proposal has been created, with arguments corresponding to intended new values for monetary policy levers.

##### ProposalRetraction
Attributes: 
  - `trustee` (address) - the trustee who is retracting their proposal

Indicates that the trustee has retracted their proposal, which can only be done in the `Stage.Propose` phase

##### VoteStart
Attributes: None

Indicates that the stage has been updated to Commit, and proposals will no longer be accepted.

##### VoteCast
Attributes:
  - `trustee` (address) - the trustee who cast this vote.

Indicates that a vote has been cast, and the trustee who cast it. Reveals nothing about the content of the vote.

##### RevealStart
Attributes: None

Indicates that the stage has been updated to Reveal, and commits will no longer be accepted.

##### VoteReveal
Attributes:
  - `voter` (indexed address) - the address of the trustee that cast the
    ballot
  - `votes` (address[]) - the ordered ballot of ranked proposals (by their proposer
    addresses)

Indicates that an inflation/deflation vote participant has revealed their vote, and creates a permanent record of a vote.

##### VoteResult
Attributes:
  - `winner` (address) the address of the trustee to propose the winning proposal

Indicates the end of an inflation/deflation vote, and acts as a permanent record of an outcome.

##### PauserAssignment
Attributes:
  - `pauser` (address) the address of pauser

Indicates that a pauser has been assigned, which indicates that the ElectCircuitBreaker has been enacted.

#### Methods

##### updateStage
Arguments: none

Checks the time and updates the `stage` variable if enough time has passed to progress to the next stage.

##### propose
Arguments:
  - `_numberOfRecipients` (uint256) - the number of random inflation rewards
    to be offered,
  - `_randomInflationReward` (uint256) - the quantity (in 10^-18 inflated ECO)
    to be given as reward,
  - `_lockupDuration` (uint256) - the minimum duration a user of a lockup must
    wait for their interest,
  - `_lockupInterest` (uint256) - the "percentage" of interest to be added,
    stored as a 9 digit fixed point number (i.e. 1_000_000_000 = 100%),
  - `_inflationMultiplier` (uint256) - the multiplier with which to scale the
    ECO currency by, stored as an 18 digit fixed point number (i.e.
    1_050_000_000_000_000_000 => 1 ECO -> 1.05 ECO or 5% inflation)
  - `_description` (string) - description of the proposal

This function allows the trustee to submit their proposal for how the monetary policy levers should be set for the following generation. This data is stored in a struct which is indexed in the mapping `proposals` which maps the submitting trustees address to the `Proposal` struct which contains these values. It sets this proposer's address as a valid proposal to vote for. Emits a `ProposalCreation` on success.

###### Security Notes
Can only be called by a trustee. Can only be called during the `Propose` `stage`. Can only be called on a cloned `CurrencyGovernance` contract. Will overwrite the previous proposal if called a second time.

##### unpropose
Arguments: none

Deletes the entry in `proposals` for `msg.sender`. Functions as a way to undo proposing so no one can vote for it. Emits 'ProposalRetraction` on success.

###### Security Notes
Can only be called during the `Propose` `stage`. Can only be called on a cloned `CurrencyGovernance` contract.

##### commit
Arguments:
  - `_commitment` (bytes32) - a commitment to a particular vote ballot (to use for verification in the future)

Commit a trusted node to a particular vote without revealing information about what that vote may be.

A commitment is the hash of the packed ABI encoding of the ballot ranking. In Solidity, the plaintext commitment can be encoded as so:
```
function encodeBallot(
    bytes32 _seed,
    Vote[] _votes
    )
    public
    pure
    returns (bytes memory)
{
    return keccak256(abi.encode(
        _seed,
        msg.sender,
        _votes
        ));
}
```

The Vote struct is defined as so:
```
struct Vote {
    // the proposal being voted for
    address proposal;
    // the score of this proposal within the ballot, min recorded score is one
    // to get a score of zero, an item must be unscored
    uint256 score;
}
```
Values for score must be in the interval `[1, numVotes]` (inclusive on both sides) where `numVotes` is the elements in the vote array being submitted. scores cannot be duplicated, they must define an ordered ranking of the proposals that are submitted with the highest score being ranked the highest. All non-included votes are treated as being given a tied score of zero. They may not be explicitly given a score of zero, you must omit them to give that score. All the `Vote` structs submitted in the hash commit must be ordered alphabetically by the proposal addresses in strictly increasing order. As such, no addresses may be duplicated.

The seed is used so that people cannot brute force crack the commitment by checking each possible vote. The trustee must keep the seed to be able to reveal their vote successfully. 

###### Security Notes
  - Can only be called by trustees.
  - Can only be called during the `Commit` `stage` of the voting process.

##### reveal
Arguments:
  - `_seed` (bytes32) - the seed used to create the hash commit
  - `_votes` (address[]) - the submitted ballot to match to the hash commit

Reveals a ballot that was previously committed to. This is called during the reveal phase of the voting process and is used to record the votes of all the trustees as well as update the currently leading proposal. Revealing adds the `score` of each `Vote` (see commit for details) to a running tally for each proposal (see the overview for this contract for a full explanation of the voting system). Afterwards it checks to see if there's a new `leader`. If a revealed vote causes a proposal to tie the `leader`, it does not become the new `leader`. The revealed vote removes the trustee's default vote for the default proposal. 

Emits the `VoteReveal` event to create a record of the vote in the log. These events can and should be used to display information about the historical voting decisions of each participant.

This method reverts in the case of an invalid vote. Invalid votes are ones that vote for addresses that do not match a submitted proposal, ones that vote for the same proposal multiple times, ones that assign an invalid score to a proposal (including a duplicate score), ones that are not ordered correctly, ones that are empty, and ones that do not match the previously submitted hash commit (see `commit`). If a vote is found to be invalid after decryption the vote will be discarded with no opportunity for adjustment or correction. Unless the hash commit was incorrectly matched and the correct matching is resubmitted, there is no way for an invalid vote to be corrected.

###### Security Notes
  - Can only be successfully called by accounts that have previously committed to a ballot by
    calling `commit` (and therefore are a trusted node).
  - The parameters must, when hashed together, match the value provided to the
    `commit` method during the commit phase.
  - Can only be called during the reveal phase.

##### compute
Arguments: none

Sets the `winner` to be whatever the current `leader` is, unless the contract is paused in which case it sets the winner to the default policy. Sets the `stage` to `Finished`. Emits the `VoteResult` event to indicate the end of the voting process and establish an accessible permanent record of the outcome.

###### Security Notes
  - Can only be called during the `Compute` `stage`.
  - Can only be called once on any given inflation contract.
  - If the [Circuit Breaker](../../currency/README.md#erc20pausable) has been enacted, this function always chooses the default proposal.

### RandomInflation
  - Inherits: `PolicedUtils`, `TimeUtils`

This contract holds and executes the reward disbursement in the result of a Random RandomInflation process, triggered by a `CurrenceGovernance` vote (see above). The disbursement is supported by two contracts: the `VDFVerifier` (see [here](../../VDF/README.md)) which does the verification and security of the initial random seed and the `InflationRootHashProposal` (see below) which does the validation of the claims.

Rewards are randomly made claimable in a manner that weights by balance and is indexed by a sequence number that runs from 0 to `recipients`, a variable decided by the governance vote and set on construction when cloned by the `CurrencyTimer` contract. The `reward` value is set this way as well and is the same for each number. Claim numbers that have been claimed are tracked in the `claimed` mapping which maps the claim number to a boolean. A successful call to `startInflation` begins a 28 day claim period. This period is divided into `numRecipients` sub-periods, and each passing sub-period allows the  next recipient in the order to claim. For example, if there are 28 recipients, the first may claim on the first day, the second on the second day, and so on. This is to reduce the shock to the economy from the addition of new funds


#### Events

##### InflationStart
Attributes:
  - `vdfVerifier` (address) - the address of the VDFVerifier contract that checks the vdf seed
  - `inflationRootHashProposal` (address) - the address of the InflationRootHashProposal for validating inflation claims
  - `claimPeriodStarts` (uint256) - the current time of when inflation starts

This event is emitted when inflation starts.

##### Claim
Attributes:
  - `who` (address) - the address of the claimant whose reward was delivered
  - `sequence` (uint256) - the claim sequence number that was used to verify that the address is in fact entitled to the reward.

This event is emitted when there is a successful claiming of a reward. It emits after the transfer of funds, so it is a marker that the claimant received the reward.

##### EntropyVDFSeedCommit
Attributes:
  - `seed` (uint256) - the initial seed used by the VDF to compute the seed
    for random inflation

Emitted when the seed for the VDF has been committed to the contract.

##### EntropySeedReveal
Attributes:
  - `seed` (bytes32) - the random seed used to determine the inflation pay-out
    recipients

Emitted after the VDF can verify that the emitted seed has entropy to fulfill the `randomVDFDifficulty` set on construction.

#### Methods

##### destruct
Arguments: none

Transfers the balance of the contract to the root policy contract when the process is over.

###### Security Notes
  - If the `seed` is set, can only be called if every claim number has been claimed.
  - Otherwise, can only be called if the contract is completely un-funded.
  - Is public to assure that, when the process is over, anyone can clean up.

##### startInflation
Arguments:
  - `_numRecipients` (uint256) - the number of recipients that will get rewards
  - `_reward` (uint256) - the amount of ECO to be given as reward to each recipient

This function is called by `CurrencyTimer` after it has cloned and funded the `RandomInflation` contract. It sets the `numRecipients` and `reward` variables based on the inputs as well as the start of the claim period to the current time.

###### Security Notes
  - Can't be called twice (can't be called if `numRecipients` is already set).
  - Can only be called on a cloned `RandomInflation` contract.
  - Reverts if the contract has not been sufficiently funded for operation.
  - As it is called as part of the function call that creates the contract it cannot be hijacked.

##### commitEntropyVDFSeed
Arguments:
  - `_primal` (uint256) - the primal to use, must have been committed to in a previous block

Sets the the seed for the VDF (`entropyVDFSeed`) after validating that the input `_primal` is probalby primal. Emits the `EntropyVDFSeedCommit` event when seed is succesfully set.

###### Security Notes
  - Cannot be run once the `entropyVDFSeed` has been set
  - Might run out of gas if there is not a prime near the blockhash, but can just be rerun in that case.

##### setPrimal
Arguments:
  - `_primal` (uint256) - the primal to set for this block

Sets the primal that will be used in `commitEntropyVDFSeed`. The `_primal` is computed off-chain  against the blockhash of current block.

###### Security Notes
  - The primal must be within a bounds of the blockhash of the last block in order to prevent gaming of the
  vdf seed.

##### submitEntropyVDF
Arguments:
  - `_y` (bytes) - the candidate input for the randomness seed (the seed will be 
    `keccak256(_y)`).

Sets the `seed` variable for determining the random inflation and emits `EntropySeedReveal`. Only does so if the `vdfVerifier` confirms that it is of sufficient random difficulty (see the [VDF Readme](../VDF/README.md) for more details).

###### Security Notes
  - Uses `entropyVDFSeed` and therefore cannot be run unless `commitEntropyVDFSeed`
    has successfully run.
  - Will likely be unsuccessful on firsts attempt if the `vdfVerifier` does not
    approve the input value.
  - Once run successfully, it cannot be run again (reverts if `seed` is already set).

##### claimFor
Arguments:
  - `_who` (address) - the address whose reward is being claimed
  - `_sequence` (uint256) - the index in the sequence order corresponding to this claim number
  - `_proof` (bytes32[]) - the “other nodes” in the Merkle tree
  - `_sum` (uint256) - cumulative sum of all account ECO votes before this node
  - `_index` (uint256) - the index of the `who` address in the Merkle tree

Verifies that the address being claimed for is a valid recipient (see `InflationRootHashProposal` for all the details about this process) and then transfers the random inflation reward to the address `_who`. Emits a `Claim` event after the transfer has been made. The staggering of claims over the claim period is indexed by the `_sequence` variable which runs from 0 up to `numRecipients`.

###### Security Notes
  - Cannot be called until the `InflationRootHashProposal` has accepted the root hash for the previous generation snapshot.
  - Can be called by anyone so that the gas fee does not need to be paid by the recipient.
  - recipients are indexed by `_sequence` and not by addresses. This means that it is not impossible for the same address to receive more than one reward, which is a consequence of the intentional choice of weighting of random chance by the ECO voting power at each address. However a `_sequence` cannot be claimed twice.

##### claim
Arguments:
  - `_sequence` (uint256) - the sequence order of the claim number
  - `_proof` (bytes32[]) - the “other nodes” in the Merkle tree
  - `_sum` (uint256) - cumulative sum of all account ECO votes before this node
  - `_index` (uint256) - which index of the tree proposer required to prove

Calls `claimFor` with `msg.sender` as the input for `_who`.

### InflationRootHashProposal
  - Inherits: `PolicedUtils`, `TimeUtils`

To distribute RandomInflation rewards, the protocol needs to establish which users can claim them. RandomInflation contract is responsible for generating a set of random claim numbers according to some parameters. InflationRootHashProposal helps to establish which users' ECO voting power match to each of those numbers - those users can claim the reward. The difference between ECO voting power and balance is that the voting power accounts for delegation.

We assume that all users would always want to participate. Then, when claiming a reward, the user simply posts a proof stating that “if all users had participated, then I would have had claim numbers from X to Y”; and if that range overlaps a winning claim number, they get paid.

Assume that there exists a Merkle tree based on a list of nodes, where each node contains the following:
 - Account number
 - Account ECO voting power
 - The cumulative sum of all account ECO voting power before this node.
 - The cumulative sum of the node represents the start of the user's claim range.

The list is sorted by ascending account number, and the Merkle root hash exists. Thus, assuming claim number X entitled its holder to a reward, the account holder of that can prove it by submitting:
 - The index in the tree
 - The cumulative sum before me
 - The “other side” of the Merkle tree

The contract can then hash account number, ECO voting power, and the cumulative sum to get the node hash, then using the supplied other side of the Merkle tree verify that submission hashes up to the root hash. Ergo the proof is correct.

If the user submits the wrong index or cumulative sum, the root hash will be wrong. To simplify verification of trees, the number of nodes is always a power of two, and the extra nodes must have account, ECO voting power, and sum set to 0. The time window (`CHALLENGING_TIME`) for challenging a root hash submission is one day.

To achieve it, the protocol needs to establish a correct root hash for every generation. Since the construction of an ordered list of all accounts would be expensive on the chain, the purpose of this contract is to allow the third party to propose a root hash correctly representing Merkle tree of all the accounts arranged as described above and let other parties verify submissions and challenge it in case the submission is wrong.

#### Events

##### RootHashPost
Attributes:
  - `proposer` (address) - address of the proposer of the root hash
  - `proposedRootHash` (bytes32) - the proposed root hash of the Merkle tree representing accounts in the system
  - `totalSum` (uint256) - total cumulative sum of all the ECO voting power (sum of the last node + its votes) 
  - `amountOfAccounts` (uint256) - total number of the accounts in the Merkle tree

Indicates that the new root hash proposal was submitted to the system

##### RootHashChallengeIndexRequest
Attributes:
  - `proposer` (address) - proposer of the root hash being challenged
  - `challenger` (address) - address of the submitter of the challenge
  - `index` (uint256) - which index of the tree proposer required to prove

Indicates that the root hash is challenged and proposer required to respond with the proof of a specific index.

##### ChallengeSuccessResponse
Attributes:
  - `proposer` (address) - the address responding to the challenge.
  - `challenger` (address) - address of the submitter of the challenge
  - `account` (address) - address of the account being challenged
  - `balance` (uint256) - balance of delegated votes at generation of the account being challenged
  - `sum` (uint256) - cumulative sum of the account being challenged
  - `index` (uint256) - index in the Merkle tree of the account being challenged

Indicates that submitted response to a challenge was successfully verified.

##### RootHashRejection
Attributes:
  - `proposer` (address) - address of the proposer of rejected root hash

Indicates that root hash was proved to be wrong or timed out on unanswered challenged and been rejected

##### ChallengeMissingAccountSuccess
Attributes:
  - `proposer` (address) - the roothash proposal address
  - `challenger` (address) - address of the submitter of the challenge
  - `missingAccount` (address) - address of the account being claimed missing
  - `index` (uint256) - index in the Merkle tree of the account being challenged


Indicates that a missing account challenge was successful, challenged root hash will be rejected

##### RootHashAcceptance
Attributes:
  - `proposer` (address) - address of the proposer of accepted root hash
  - `totalSum` (uint256) - total cumulative sum of all the ECO voting power of this proposal
  - `amountOfAccounts` (uint256) - total number of the accounts in the Merkle tree of this proposal

Indicates that a new root hash proposal was accepted by the system, now recipients can claim inflation rewards

##### ConfigureBlock
Attributes:
  - `_blockNumber` (uint256) - the block number to verify accounts balances against

Indicates that the configuration for the inflation root hash proposal contract is set

#### Methods

##### configure
Arguments:
  - `_blockNumber` (uint256) - the block number at which to check ECO voting power against

Configures an InflationRootHashProposal setting the block number for which contract will establish root hash.

###### Security Notes
  - Can be run only once (reverts if `_blockNumber` is already set) and is called during cloning.
    
##### proposeRootHash
Arguments:
  - `_proposedRootHash` (bytes32) - the proposed root hash of the Merkle tree representing accounts in the system
  - `_totalSum`         (uint256) - total cumulative sum of all the ECO votes
  - `_amountOfAccounts` (uint256) - total number of the accounts in the Merkle tree

Allows to propose new root hash to the system. Takes the submitted function parameters and saves them in the mapping `rootHashProposals` which maps the proposer address (the `msg.sender`) to the `proposal` struct. The challenge time window (1 day) is also marked as staring at this point. A `RootHashPost` event is then emitted and the fee (`PROPOSER_FEE`) of 20000 ECO is charged and stored for the newly proposed root hash proposal.

###### Security Notes
  - New proposals only allowed before root hash is accepted.
  - Only one proposal per proposer.
  - The proposed hash must have at least one account.

##### challengeRootHashRequestAccount
Arguments:
  - `_proposer`  (address) - the roothash proposer address
  - `_index`     (uint256) - index in the Merkle tree of the account being challenged

Allows to challenge previously proposed root hash. Challenge requires proposer of the root hash submit proof of the account for requested index. Creates a record of the challenge in the `challenges` property of the proposal struct and sets the challenge status to pending. The challenge is given 1 day to be responded to. A `RootHashChallengeIndexRequest` event is then emitted and the fee of 500 ECO (`CHALLENGE_FEE`) is charged and stored for the challenged root hash proposal.

###### Security Notes
  - You cannot challenge your own proposal (same challenger address as proposer)
  - The root hash challenged must match the one in the proposal
  - The status of the challenged root hash must be Pending
  - The index being challenged must be in the number of accounts in the proposal
  - Only 2 log N + 2 challenges are allowed per challenger where N is the number of accounts proposed.
  - New challenges are only allowed before root hash is accepted
  - New challengers can submit a challenge 24 hours after root hash was proposed.
  - The challenger may then submit additional challenges within the challenge response window of other challenges they have open. However, this does not increase the challenge window.
  - Indices can only be challenged once per proposal.

##### claimMissingAccount
Arguments:
  - `_proposer`           (address) - the roothash proposer address
  - `_index`              (uint256) - index in the Merkle tree of the account being challenged
  - `_account`            (address) - address of the missing account

A special challenge, the challenger can claim that an account is missing, which it does by saying “index X should be account A”.  “X” and “X-1” must have been previously challenged, and if the contract sees that A has votes, and account(X) > A > account(x-1), then the proposal is rejected and a `ChallengeMissingAccountSuccess` event is emitted.

###### Security Notes
  - You cannot challenge your own proposal (same challenger address as proposer)
  - The root hash challenged must match the one in the proposal
  - The status of the challenged root hash must be Pending
  - The index being challenged must be in the number of accounts in the proposal
  - The account being claimed to be missing must have ECO voting power
  - Only 2 log N + 2 challenges are allowed per challenger where N is the number of accounts proposed.
  - New challenges are only allowed before root hash is accepted
  - New challengers can submit a challenge 24 hours after root hash was proposed.
  - The challenger may then submit additional challenges within the challenge response window of other challenges they have open.
  - The proposal must have had the adjacent indices challenged.
  - Indices can only be challenged once per proposal.
    
##### respondToChallenge
Arguments:
  - `_challenger`     (address)   - address of the submitter of the challenge
  - `_proof`          (bytes32[]) - the “other nodes” in the Merkle tree.
  - `_account`        (address)   - address of an account of challenged index in the tree
  - `_claimedBalance` (uint256)   - balance of votes for the account account of the challenged index in the tree
  - `_sum`            (uint256)   - cumulative sum of an account of challenged index in the tree
  - `_index`          (uint256)   - index in the Merkle tree being answered

Allows the proposer of the root hash respond to a challenge of specific index with proof details. This will revert unless the inputs successfully refute the challenge. The challenge is marked as resolved on refutation and a `ChallengeSuccessResponse` event is emitted. The challenger is given 1 hour more of challenge times in which to submit any additional challenges, if able.

###### Security Notes
  - The root hash must exist.
  - Can only be called if the root hash is not yet accepted.
  - Only proposer of the root hash can respond to a challenge.
  - The challenge must exist.
  - The challenge response time must not be over.
  - The account must have the claimed ECO voting power. See [getPastVotes](../currency/README.md#getpastvotes).
  - The Merkle proof must verify correctly
  - If the index is 0, the cumulative `_sum` must be zero
  - The left and right neighbors of the challenged index must be consistent with the proof of this index.

##### checkRootHashStatus
Arguments:
  - `_proposer` (address) - the root hash proposer's address

Checks root hash proposal. If time is out and there is unanswered challenges proposal is rejected. If time to submit new challenges is over and there is no unanswered challenges, root hash is accepted.

###### Security Notes
  - The `_rootHash` specified must be an actually proposed one.

##### verifyClaimSubmission
Arguments:
  - `_who_`   (address)   - address of the account attempting to claim
  - `_proof`  (bytes32[]) - the “other nodes” in the Merkle tree.
  - `_sum`    (uint256)   - cumulative sum of a claiming account 
  - `_index`  (uint256)   - index of the account

Verifies that the account specified is associated with the provided cumulative sum in the approved Merkle tree for the current generation. Used by the `RandomInflation` contract to make sure that the account claiming is doing so in a way that matches the root hash proposal.

###### Security Notes
  - Contract can verify accounts after correct root hash was determined

##### claimFeeFor
Arguments:
  - `_who`      (address) - fee recipient
  - `_proposer` (address) - the roothash proposer address

Allows to claim fee. If root hash is successful the proposer gets the proposer fee back + all the challenge fees. If the proposed root hash is rejected, proposer fee is distributed among the challengers (weighted by number of challenges). The challengers also have their staked challenge returned in full.

###### Security Notes
  - Fees are distributed after root hash has been accepted or rejected
  - The address being claimed for must either be a proposer or challenger, given the end state of the proposal.
 
##### claimFee
Arguments:
  - `_proposer` (address) - the roothash proposer address

Allows to claim fee on behalf of the caller (`msg.sender`).
See claimFeeFor

###### Security Notes
  - `msg.sender` must correctly be a proposer or challenger given the end state of the proposal.

##### destruct
Arguments: none

Sends any leftover tokens to the rootpolicy treasury.

###### Security Notes
  - Can only be called after the end fee collection period.

### Lockup
  - Inherits: `PolicedUtils`, `TimeUtils`

Provides deposit certificate functionality, used to slow down the rate of spending. Is a template contract that is cloned and initialized when it is offered (as the result of a `CurrencyGovernance` vote) by the `CurrencyTimer` contract on the start of a new generation.

The deposit certificates system operates in three parts. First, during the sale period, currency holders are able to make deposits. Then, during the lockup period, deposit holders are able to withdraw but at a penalty. Finally, at the end of the lockup period deposit holders are able to withdraw their initial deposit along with the promised interest.

Interest is stored as a 9 digit fixed point number and is calculated via integer multiplication and truncated division.

#### Events
##### Deposit
Attributes:
  - `to` (address) - the address that a certificate was sold/issued to
  - `amount` (uint256) - the amount of tokens deposited in the certificate

Indicates the sale of a deposit certificate.

##### Withdrawal
Attributes:
  - `to` (address) - the address withdrawing from the certificate
  - `amount` (uint256) - the amount of tokens withdrawn

Indicates the withdrawal of funds from a deposit certificate.

#### Methods

##### deposit
Arguments:
  - `_amount` (uint256) - the amount to deposit

Transfers funds from the caller's balance to this contract and records the deposited amount. The transfer from the caller's balance must be approved before this method is called. Does not effect the users' or their delegates' voting amount. Can be called multiple times to increase the amount deposited, but withdrawals are not possible until after the end of the sale period. Emits the `Deposit` event.

##### depositFor
Arguments:
  - `_amount` (uint256) - the amount to deposit
  - `_benefactor` (address) - address to deposit on behalf of

Deposits funds on behalf of another account. This is done in order to allow for someone else to pay for the gas costs of deposit calls. See `deposit`, as this function calls it but with a benefactor's address instead of its own.

##### withdraw
Arguments: none

If called after the end of the lockup period, transfer the initial deposit amount then calls to `CurrencyTimer` to mint the promised interest earned to the deposit holder. If called before the end of the lockup period, transfer the initial deposit amount then calls to `CurrencyTimer` to burn the promised interest earned (as a penalty for early withdrawal) for the deposit holder. Emits the `Withdrawal` event. Identical to `withdrawFor` on behalf of the caller (`msg.sender`), allowing for deposits to be withdrawn early.

###### Security Notes
  - The calling address must have made a deposit.
  - `CurrencyTimer` is delegated the responsibity of giving interest or burning the penalty to not effect delegation.

##### withdrawFor
Arguments:
  - `_who` (address) - the address of the account to withdraw on behalf of

Identical to `withdraw` except may not be withdrawn early, but may be executed for any address with a valid deposit that has waited the full period.

###### Security Notes
  - May only be called after the lockup period has ended.
  - `_owner` must have made a deposit.
  - Transfers are always made to the account of `_owner`.

### TrustedNodes
  - Inherits: `PolicedUtils`

Provides a registry of trustees, and allows the root policy contract to grant or revoke trust. Trusted nodes participate in the inflation/deflation voting process. They can be added and removed using policy proposals.

#### Events

##### TrustedNodeAddition
Attributes:
  - `node` (address) the address of the new trusted node
  - `cohort` (uint256) the trustee cohort 

Emitted by the `trust` function.

##### TrustedNodeRemoval
Attributes:
  - `node` (address) the address of the old trusted node removed
  - `cohort` (uint256) the trustee cohort 

Emitted by the `distrust` function.

##### VotingRewardRedemption
Attributes: 
  - `recipient` (address) the address of the reward recipient. This will either be a trustee or the community treasury.
  - `amount` (uint256) the amount of ECOx transferred redeemed to the recipient

Emitted by the `redeemVoteRewards` function or the `annualUpdate` function
if recipient is the hoard.

##### FundingRequest
Attributes:
  - `amount` (uint256) the amount of ECOx that needs to be added to the TrustedNodes contract to ensure continued payouts going forward

Emitted by 'newCohort' and 'annualUpdate'.

##### RewardsTrackingUpdate
Attributes:
  - `nextUpdateTimestamp` (uint256) the timestamp at which this contract needs to transfer unallocated rewards to the hoard and be topped up with ECOx
  - `newRewardsCount` (uint256) the number of voterewards this contract is funded for

Emitted by the `annualUpdate` function.

#### Methods

##### trust
Arguments:
  - `_node` (address) - the node to grant trust to

Grants trust to a node.

##### distrust
Arguments:
  - `_node` (address) - the node to revoke trust in

Revokes trust in a node.

##### recordVote
Arguments:
  - `_who` (address) - the trustee node

Records that a trustee has voted, this is used for allocating rewards to the trustees for participation

##### redeemVoteRewards
Arguments: none

Called by a trustee in order to redeem any rewards from the previous generation that they have earned for participating in that generation's voting. Sends the trustee ECOx in the amount rewarded, and emits `VotingRewardRedemption`

###### Security Notes
  - The trustee must have existing rewards to claim

##### numTrustees
Arguments: none

Return the number tursties in the current cohort

##### isTrusted
Arguments:
  - `_node` (address) - the trustee node

Checks if a node address is trusted in the current cohort

##### newCohort
Arguments:
  - `_newCohort` (address[]) - the trustee node

Adds a new cohort of trustees. Used for implementing the results of a trustee election. It emits a  `FundingRequest` event if the new cohort has more members than the last cohort, increments the current cohort by 1. Finally it sets the new cohort and `_trust`s all of its nodes, emitting `TrustedNodeAddition` for each new trustee node.

##### annualUpdate
Arguments: none

Updates the trustee rewards that they have earned for the year and then sends the unallocated reward to the hoard. Emits a `FundingRequest` for any unallocated rewards, `VotingRewardRedemption` for the redeemed rewards, and `RewardsTrackingUpdate`.

###### Security Notes
  - Can only call this once the block timestamp is past the `yearEnd` term.

## Contributing
See the [main README](../../../README.md).

## License
See the [main README](../../../README.md).
