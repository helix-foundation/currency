# Monetary Governance System
> Monetary governance policies for the Eco currency.

These contracts provide the governance system for the eco currency. They
specify how the currency is to be managed, and how the software and processes
themselves are over-seen.

## Table of Contents
  - [Security](#security)
  - [Background](#background)
  - [Install](#install)
  - [Usage](#usage)
  - [API](#api)
  - [Contributing](#contributing)
  - [License](#license)

## Security
The security of the governance contracts is built on a list of trustees.
See the `TrustedNodes` contract for how the list maintained. Changes to the
list of trustees can be only be made using policy proposals, and require
the support of a majority of participating voters, weighted by stake.

## Background
The trustee and community governance contracts provide a policy hierarchy (built
in Eco's policy framework). It allows Eco's trustees (a list of which is
managed by a `TrustedNodes` instance) to enact inflationary or deflationary
measures, and allows all stake-holders in the currency to participate in
elections for broader changes to the currency or how it's governed.

The `TimedPolicies` contract implements the governmental schedule, and
instantiates (by cloning) the appropriate contracts as well as notifying each
other contract each time the cycle resets. There are two distinct types of
periodic votes:
  - Monetary Policy Decisions (managed by trustees)
  - General Policy Decisions (open to every currency holder)

Each type of periodic vote has different methods of coming to a decision.
However, both votes are set to the global Generation Cycle of 14 days.

> Note that the vote frequency is likely to change based on feedback and
> observed use. It is bounded below by the VDF safety margins, setting a
> maximum frequency of once every five days. 14 days was selected based on
> estimates of how long it would take to observe the impact of a previous vote.

### Monetary Policy Decisions
Monetary Policy decisions involve only the Trusted Nodes. They're used to
create and distribute new currency (to drive spending), to create and
distribute deposit certificates (to discourage spending), or scale the currency
across the board (to manage exchange value with other currencies). The different
policy levers are designed to reward different behavior and provide incentives
to achieve their desired results.

This process runs in 3 phases. First is a 10 day period over which trustees each
can submit their proposals for new values for the 3 monetary policy levers
(detailed below). Then there is a 3 day phase in which the trustees create
ballots ranking the proposals using a partial Borda Count method, then submit
them in the form of a hash commit. Finally there is a 1 day phase where votes
are revealed and counted ending in a winner being chosen and applied for the
next generation.

#### Random Inflation
An random inflation policy decision creates new currency and distributes it
randomly to anyone who held currency at the end of the last cycle. No
registration is required, and probability of receiving a share of the newly
minted currency is weighted by balance held.

#### Lockups
Deflation (or a similar slowing of the economy) is achieved by issuing deposit
certificates that bear interest. These lockups are sold, and the certificate
holders receive newly created currency as interest on their deposits when they
retrieve their funds at the end of the lockup duration.

#### Linear Inflation/Deflation
This policy lever scales the balance for every single address by the same
percentage amount. It increases or decreases the total supply while leaving the
relative purchasing power of each user, relative to each other, the same.
This can be used to change the value of ECO when compared to other currencies
as an example.

## Install
See the [main README](../../README.md) for installation instructions.

## Usage
The governance contracts deploy as a policy hierarchy implemented in Eco's
[policy framework](../policy/README.md). The `TimedPolicies` contract should be
deployed as the "TimedPolicies" policy object, and is constructed with references to
the other contracts needed for specific votes and outcomes.

The `TimedPolicies` contract will clone the referenced contracts as needed, and
grant the clones the relevant permissions. See `startInflation` for an example.
It will also notify all other `IGenerationIncrease` contracts each time a generation
increases, coordinating the switchover to each subsequent generation.

## API
Each section here discusses the API used to interact with one part of the
governance process, starting with the contract overseeing periodic voting and
moving on to the periodic voting processes themselves.

### Timing
#### TimedPolicies
  - Inherits: `Policed`

The `TimedPolicies` contract manages the time-based recurring processes that
form the governance system. Existing processes that are activated by this
inherit from the interface `IGenerationIncrease` to have the function 
`notifyGenerationIncrease` which is called by this contract. The policy
voting contract is directly cloned from this contract.

##### Process Overview
This contract holds and maintains an array `notificationHashes` which contains
the ERC1820 keys for the different `IGenerationIncrease` contracts. This is set on
construction. When the generation increase is triggered, this contract looks
up the addresses for each of these contracts and calls their implementation
of `notifyGenerationIncrease`.

##### Events
###### PolicyDecisionStarted
Attributes:
  - `contractAddress` (address) - the address of the `PolicyProposals` contract
    supervising the vote

Indicates the start of a policy vote.

##### incrementGeneration
Arguments: none

Increments the `internalGeneration` and sets the time at which the new generation
will end. Then goes through the list of `notificationHashes` and calls
`notifyGenerationIncrease()` on each of them. Finally calls `startPolicyProposal`
(detailed below).

###### Security Notes
This method can only be invoked at most once every `TimedPolicies.GENERATION_DURATION`
(currently 14 days), but can be invoked by anyone who wishes to begin a the next
generation. Will likely be maintained by off-chain automation.

##### startPolicyProposal
Arguments: none

Begins a new policy voting process. A new instance of the `PolicyProposals`
contract is created and granted appropriate permissions. The address of the
new contract can be found by querying the root policy address for the
`PolicyProposals` policy provider (see ERC1820 references for more info).

A `PolicyDecisionStarted` event is emitted with the `PolicyProposals` contract
address to indicate the start of a new vote.

###### Security Notes
This function is internal.

### Monetary Governance Decisions
#### CurrencyGovernance
  - Inherits: `PolicedUtils`

This is the trustee monetary policy decision-making contract. It acts as a venue
to both propose and vote on policy decisions. It is cloned for use by the
`CurrencyTimer` contract and most of its functionality only works if cloned,
denoting an active voting process whose progress is tracked in the `stage` 
enum which denotes the phase of the voting.

Proposals are submitted by trustees calling `propose` with their desired values
for the different monetary policy levers. These proposal structs are stored in
the mapping `proposals` which maps the submitting trustee address (the key for
the proposal for the whole voting process) to the struct that holds their
proposed values. Trustees my withdraw and modify their proposals at any point
during this phase. Along with the proposed votes, a 'default proposal' exists that
enacts no change to the currency.

Once the proposing stage (first 10 days of a generation) completes, the submitted
proposals move on to a partial Borda voting phase. A Borda vote is one where the
voter submits a ranked choice ballot ranking all of the options. Then each choice
is given n - i votes where n is the number of options and i is the position on the
ballot (rank first is i = 0, ranked second is i = 1 and so on). In the partial
Borda vote, the calculation is similar, except the voter my rank as many options as
they choose, and then n is instead the number of options that were ranked on the
submitted ballot. As a default, all trustees are considered to have an initial
vote that only ranks the default proposal. This default vote is replaced by their
submitted vote if they successfully submit and reveal.

Votes are submitted via a hash commit of an ordered list of addresses corresponding
to each proposal (its submitter, as specified above). One the 3 day period for
submitting vote hash commits is done, the trustees must reveal their votes by
calling `reveal` with a list of addresses that matches their hash commit. During
this period, the `leader` variable, storing the address that corresponds to the
leading proposal is updated on each reveal.

The reveal phase is followed by a 1 day compute phase that finalizes the `winner`
in an event and moves the contract into a dormant, `Finished` `stage`. The
contract is thereon forward used as a lookup point for the values of the winning
proposal.

##### Events

###### ProposalCreated
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

Indicates that a new proposal has been created, with arguments corresponding to 
intended new values for monetary policy levers.

###### VoteStart
Attributes: None

Indicates that the stage has been updated to Commit, and proposals will no longer
be accepted.

###### VoteCast
Attributes:
  - `trustee` (address) - the trustee who cast this vote.

Indicates that a vote has been cast, and the trustee who cast it. Reveals nothing
about the content of the vote. 

###### RevealStarted
Attributes: None

Indicates that the stage has been updated to Reveal, and commits will no longer
be accepted.

###### VoteRevealed
Attributes:
  - `_voter` (indexed address) - the address of the trustee that cast the
    ballot
  - `votes` (address[]) - the ordered ballot of ranked proposals (by their proposer
    addresses)

Indicates that an inflation/deflation vote participant has revealed their vote,
and creates a permanent record of a vote.

###### VoteResults
Attributes:
  - `winner` (address) the address of the trustee to propose the winning proposal

Indicates the end of an inflation/deflation vote, and acts as a permanent record
of an outcome.

###### NewInflationMultiplier
Attributes:
  - `inflationMultiplier` (uint256) - the inflation multiplier for the newly
    accepted proposal.

Indicates the inflation multiplier for the newly accepted proposal. 

##### updateStage
Arguments: none

Checks the time and updates the `stage` variable if enough time has passed to
progress to the next stage.

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

This function allows the trustee to submit their proposal for how the monetary
policy levers should be set for the following generation. This data is stored
in a struct which is indexed in the mapping `proposals` which maps the submitting
trustees address to the `Proposal` struct which contains these values. It sets
this proposer's address as a valid proposal to vote for.

###### Security Notes
Can only be called by a trustee. Can only be called during the `Propose` `stage`.
Can only be called on a cloned `CurrencyGovernance` contract. Will overwrite
the previous proposal if called a second time.

##### unpropose
Arguments: none

Deletes the entry in `proposals` for `msg.sender`. Functions as a way to undo
proposing so no one can vote for it.

###### Security Notes
Can only be called during the `Propose` `stage`. Can only be called on a cloned
`CurrencyGovernance` contract.

##### commit
Arguments:
  - `_commitment` (bytes32) - a commitment to a particular vote ballot (to use for
   verification in the future)

Commit a trusted node to a particular vote without revealing information about
what that vote may be.

A commitment is the hash of the packed ABI encoding of the ballot ranking. In
Solidity, the plaintext commitment can be encoded as so:
```
function encodeBallot(
    bytes32 _seed,
    address[] _votes
    )
    internal
    pure
    returns (bytes memory)
{
    return keccak256(abi.encodePacked(
        _seed,
        msg.sender,
        _votes
        ));
}
```

The seed is used so that people cannot brute force crack the commitment by
checking each possible vote. The trustee must keep the seed to be able to reveal
their vote successfully. 

###### Security Notes
  - Can only be called by trustees.
  - Can only be called during the `Commit` `stage` of the voting process.

##### reveal
Arguments:
  - `_votes` (address[]) - the submitted ballot to match to the hash commit
  - `_seed` (bytes32) - the seed used to create the hash commit

Reveals a ballot that was previously committed to. This is called during the
reveal phase of the voting process and is used to record the votes of all the
trustees as well as update the currently leading proposal. Each reveal
adds votes to a running tally (see the overview for this contract for a full
explanation of the voting system) and checks to see if there's a new `leader`.
The revealed vote also removes the trustee's default vote for the default proposal.
If a revealed vote causes a proposal to tie the `leader`, it does not become the
new `leader`.

> If a vote is found to be invalid after decryption the vote will be discarded
> with no opportunity for adjustment or correction.

Emits the `VoteRevealed` event to create a record of the vote in the log. These
events are used by the client to display information about the historical voting
decisions of each participant.

Reverts in the case of an invalid vote. Invalid votes are ones that vote for
invalid proposals (see `propose`/`unpropose`) or ones that vote for the same
proposal multiple times.

###### Security Notes
  - Can only be called by accounts that have previously committed to a ballot by
    calling `commit` (and therefore are a trusted node).
  - The parameters must, when hashed together, match the value provided to the
    `commit` method during the commit phase.
  - Can only be called during the reveal phase.

##### compute
Arguments: none

Sets the `winner` to be whatever the current `leader` is. Sets the `stage` to
`Finished`. Emits the `VoteResults` event to indicate the end of the voting process
and establish an accessible permanent record of the outcome.

###### Security Notes
  - Can only be called during the `Compute` `stage`.
  - Can only be called once on any given inflation contract.

#### RandomInflation
  - Inherits: `PolicedUtils`

This contract holds and executes the reward disbursement in the result of a Random
RandomInflation process, triggered by a `CurrenceGovernance` vote (see above). The disbursement
is supported by two contracts: the `VDFVerifier` (see [here](../VDF/README.md)) which does
the verification and security of the initial random seed and the `InflationRootHashProposal`
(see below) which does the validation of the claims.

Rewards are randomly made claimable in a manner that weights by balance and is
indexed by a sequence number that runs from 0 to `recipients`, a variable
decided by the governance vote and set on construction when cloned by the
`CurrencyTimer` contract. The `reward` value is set this way as well and is the
same for each number. Claim numbers that have been claimed are tracked
in the `claimed` mapping which maps the claim number to a boolean.
A successful call to `startInflation` begins a 28 day claim period. This period is
divided into `numRecipients` sub-periods, and each passing sub-period allows the 
next recipient in the order to claim. For example, if there are 28 recipients, the
first may claim on the first day, the second on the second day, and so on. This is
to reduce the shock to the economy from the addition of new funds


##### Events

###### Claim
Attributes:
  - `who` (address) - the address of the claimant whose reward was delivered
  - `sequence` (uint256) - the claim sequence number that was used to verify
    that the address is in fact entitled to the reward.

This event is emitted when there is a successful claiming of a reward. It emits
after the transfer of funds, so it is a marker that the claimant received the reward.

###### EntropyVDFSeedCommit
Attributes:
  - `seed` (uint256) - the initial seed used by the VDF to compute the seed
    for random inflation

Emitted when the seed for the VDF has been committed to the contract.

###### EntropySeedReveal
Attributes:
  - `seed` (bytes32) - the random seed used to determine the inflation pay-out
    recipients

Emitted after the VDF can verify that the emitted seed has entropy to fulfill
the `randomVDFDifficulty` set on construction.

##### startInflation
Arguments:
  - `_numRecipients` (uint256) - the number of rewards to be claimable
  - `_reward` (uint256) - the amount of ECO to be given as reward to each recipient

This function is called by `CurrencyTimer` after it has cloned and funded the
`RandomInflation` contract. It sets the `numRecipients` and `reward` variables based on the
inputs as well as the start of the claim period to the current time.

###### Security Notes
  - Can't be called twice (can't be called if `numRecipients` is already set).
  - Can only be called on a cloned `RandomInflation` contract.
  - Reverts if the contract has not been sufficiently funded for operation.
  - As it is called as part of the function call that creates the contract it
    cannot be hijacked.

##### commitEntropyVDFSeed
Arguments: none

Finds a probable prime near the blockhash (at run time) to use as the seed for
the VDF (`entropyVDFSeed`). Emits `EntropyVDFSeedCommit` when successful.

###### Security Notes
  - Cannot be run once the `entropyVDFSeed` has been set
  - Might run out of gas if there is not a prime near the blockhash, but can just
    be rerun in that case.

##### submitEntropyVDF
Arguments:
  - `_y` (bytes) - the candidate input for the randomness seed (the seed will be 
    `keccak256(_y)`).

Sets the `seed` variable for determining the random inflation and emits
`EntropySeedReveal`. Only does so if the `vdfVerifier` confirms that it is of
sufficient random difficulty (see the [VDF Readme](../VDF/README.md) for more details).

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

Verifies that the address being claimed for is a valid recipient (see 
`InflationRootHashProposal` for all the details about this process) and then
transfers the random inflation reward to the address `_who`. Emits a `Claim` event
after the transfer has been made. The staggering of claims over the claim
period is indexed by the `_sequence` variable which runs from 0 up to `numRecipients`.

###### Security Notes
  - Cannot be called until the `InflationRootHashProposal` has accepted the root
    hash for the previous generation snapshot.
  - Can be called by anyone so that the gas fee does not need to be paid by the
    recipient.
  - recipients are indexed by `_sequence` and not by addresses. This means that it
    is not impossible for the same address to receive more than one reward, which is
    a consequence of the intentional choice of weighting of random chance by the
    ECO voting power at each address. However a `_sequence` cannot be claimed twice.

##### claim
Arguments:
  - `_sequence` (uint256) - the sequence order of the claim number
  - `_proof` (bytes32[]) - the “other nodes” in the Merkle tree
  - `_sum` (uint256) - cumulative sum of all account ECO votes before this node
  - `_index` (uint256) - which index of the tree proposer required to prove

Calls `claimFor` with `msg.sender` as the input for `_who`.

##### destruct
Arguments: none

Destructs the `vdfVerifier` and transfers the balance of the contract to the root
policy contract.

###### Security Notes
  - If the `seed` is set, can only be called if every claim number has been claimed.
  - Otherwise, can only be called if the contract is completely un-funded.
  - Is public to assure that, when the process is over, anyone can clean up.

#### InflationRootHashProposal
  - Inherits: `PolicedUtils`

To distribute RandomInflation rewards we need to establish which users can claim them. RandomInflation contract is responsible for generating a set of random claim numbers according to some parameters. InflationRootHashProposal helps to establish which users' ECO voting power match to each of those numbers - those users can claim the reward. The difference between ECO voting power and balance is that the voting power accounts for delegation.

We assume that all users would always want to participate. Then, when claiming a reward, the user simply posts a proof stating that “if all users had participated, then I would have had claim numbers from X to Y”; and if that range overlaps a winning claim number, they get paid.

Assume that there exists a Merkle tree based on a list of nodes, where each node contains the following:
Account number
Account ECO voting power
The cumulative sum of all account ECO voting power before this node.
The cumulative sum of the node represents the start of the user's claim range.

The list is sorted by ascending account number, and the Merkle root hash exists.
Thus, assuming claim number X entitled its holder to a reward, the account holder of that can prove it by submitting:
The index in the tree
The cumulative sum before me
The “other side” of the Merkle tree

The contract can then hash account number, ECO voting power, and the cumulative sum to get the node hash, then using the supplied other side of the Merkle tree verify that submission hashes up to the root hash. Ergo the proof is correct.

If the user submits the wrong index or cumulative sum, the root hash will be wrong. To simplify verification of trees, the number of nodes is always a power of two, and the extra nodes must have account, ECO voting power, and sum set to 0. The time window (`CHALLENGING_TIME`) for challenging a root hash submission is one day.

To achieve it we need to establish a correct root hash for every generation. Since the construction of an ordered list of all accounts would be expensive on the chain, the purpose of this contract is to allow the third party to propose a root hash correctly representing Merkle tree of all the accounts arranged as described above and let other parties verify submissions and challenge it in case the submission is wrong.

##### Events
###### RootHashChallengeIndexRequestAdded
Attributes:
  - `proposer` (address) - proposer of the root hash being challenged
  - `challenger` (address) - address of the submitter of the challenge
  - `rootHash` (bytes32) - root hash being challenged
  - `index` (uint256) - which index of the tree proposer required to prove

Indicates that the root hash is challenged and proposer required to respond with the proof of a specific index.

###### ChallengeResponseVerified
Attributes:
  - `proposer` (address) - the address responding to the challenge.
  - `proposedRootHash` (bytes32) - root hash being challenged
  - `challenger` (address) - address of the submitter of the challenge
  - `account` (address) - address of the account being challenged
  - `balance` (uint256) - balance of delegated votes at generation of the account being challenged
  - `sum` (uint256) - cumulative sum of the account being challenged
  - `index` (uint256) - index in the Merkle tree of the account being challenged

Indicates that submitted response to a challenge was successfully verified.

###### RootHashProposed
Attributes:
  - `proposedRootHash` (bytes32) - the proposed root hash of the Merkle tree representing accounts in the system
  - `totalSum` (uint256) - total cumulative sum of all the ECO voting power (sum of the last node + its votes) 
  - `amountOfAccounts` (uint256) - total number of the accounts in the Merkle tree
  - `proposer` (address) - address of the proposer of the root hash

Indicates that the new root hash proposal was submitted to the system

###### RootHashRejected
Attributes:
  - `proposedRootHash` (bytes32) - the rejected root hash
  - `proposer` (address) - address of the proposer of rejected root hash

Indicates that root hash was proved to be wrong or timed out on unanswered challenged and been rejected

###### RootHashAccepted
Attributes:
  - `proposedRootHash` (bytes32) - the accepted root hash
  - `totalSum` (uint256) - total cumulative sum of all the ECO voting power of this proposal
  - `amountOfAccounts` (uint256) - total number of the accounts in the Merkle tree of this proposal
  - `proposer` (address) - address of the proposer of accepted root hash

Indicates that a new root hash proposal was accepted by the system, now recipients can claim inflation rewards

###### ChallengeMissingAccountSuccess
Attributes:
  - `proposer` (address) - the roothash proposal address
  - `proposedRootHash` (bytes32) - the proposed root hash of the Merkle tree representing accounts in the system
  - `challenger` (address) - address of the submitter of the challenge
  - `missingAccount` (address) - address of the account being claimed missing

Indicates that a missing account challenge was successful, challenged root hash will be rejected

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

Allows to propose new root hash to the system. Takes the submitted function
parameters and saves them in the mapping `rootHashProposals` which maps the
proposer address (the `msg.sender`) to the `proposal` struct. The challenge time
window (1 day) is also marked as staring at this point. A `RootHashProposed`
event is then emitted and the fee (`PROPOSER_FEE`) of 20000 ECO is charged
and stored for the newly proposed root hash proposal.

###### Security Notes
  - New proposals only allowed before root hash is accepted.
  - Only one proposal per proposer.
  - The proposed hash must have at least one account.

##### challengeRootHashRequestAccount
Arguments:
  - `_proposer`           (address) - the roothash proposer address
  - `_requestedIndex`     (uint256) - index in the Merkle tree of the account being challenged

Allows to challenge previously proposed root hash. Challenge requires proposer of the root hash submit proof of the account for requested index. Creates a record of the challenge in the `challenges` property of the proposal struct and sets the challenge status to pending. The challenge is given 1 day to be responded to. A `RootHashChallengeIndexRequestAdded` event is then emitted and the fee of 500 ECO (`CHALLENGE_FEE`) is charged and stored for the challenged root hash proposal.

###### Security Notes
  - You cannot challenge your own proposal (same challenger address as proposer)
  - The root hash challenged must match the one in the proposal
  - The status of the challenged root hash must be Pending
  - The index being challenged must be in the number of accounts in the proposal
  - Only 2 log N + 2 challenges are allowed per challenger where N is the number
    of accounts proposed.
  - New challenges are only allowed before root hash is accepted
  - New challengers can submit a challenge 24 hours after root hash was proposed.
  - The challenger may then submit additional challenges within the challenge
    response window of other challenges they have open. However, this does not
    increase the challenge window.
  - Indices can only be challenged once per proposal.

##### claimMissingAccount
Arguments:
  - `_proposer`           (address) - the roothash proposer address
  - `_index`              (uint256) - index in the Merkle tree of the account being challenged
  - `_account`            (address) - address of the missing account

A special challenge, the challenger can claim that an account is missing, which it does by saying “index X should be account A”. 
“X” and “X-1” must have been previously challenged, and if the contract sees that A has votes, 
and account(X) > A > account(x-1), then the proposal is rejected and a `ChallengeMissingAccountSuccess` event is emitted.

###### Security Notes
  - You cannot challenge your own proposal (same challenger address as proposer)
  - The root hash challenged must match the one in the proposal
  - The status of the challenged root hash must be Pending
  - The index being challenged must be in the number of accounts in the proposal
  - The account being claimed to be missing must have ECO voting power
  - Only 2 log N + 2 challenges are allowed per challenger where N is the number
    of accounts proposed.
  - New challenges are only allowed before root hash is accepted
  - New challengers can submit a challenge 24 hours after root hash was proposed.
  - The challenger may then submit additional challenges within the challenge
    response window of other challenges they have open.
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

Allows to proposer of the root hash respond to a challenge of specific index with proof details.
This will revert unless the inputs successfully refute the challenge. The challenge is marked
as resolved on refutation and a `ChallengeResponseVerified` event is emitted. The challenger
is given 1 hour more of challenge times in which to submit any additional challenges, if able.

###### Security Notes
  - The root hash must exist.
  - Can only be called if the root hash is not yet accepted.
  - Only proposer of the root hash can respond to a challenge.
  - The challenge must exist.
  - The challenge response time must not be over.
  - The account must have the claimed ECO voting power. See [getPastVotes](../currency/README.md#getpastvotes).
  - The Merkle proof must verify correctly
  - If the index is 0, the cumulative `_sum` must be zero
  - The left and right neighbors of the challenged index must be consistent
    with the proof of this index.

##### checkRootHashStatus
Arguments:
  - `_proposer` (address) - the root hash proposer's address

Checks root hash proposal. If time is out and there is unanswered challenges proposal is rejected. If time to submit
new challenges is over and there is no unanswered challenges, root hash is accepted.

###### Security Notes
  - The `_rootHash` specified must be an actually proposed one.

##### verifyClaimSubmission
Arguments:
  - `_who_`   (address)   - address of the account attempting to claim
  - `_proof`  (bytes32[]) - the “other nodes” in the Merkle tree.
  - `_sum`    (uint256)   - cumulative sum of a claiming account 

Verifies that the account specified is associated with the provided cumulative
sum in the approved Merkle tree for the current generation. Used by the `RandomInflation`
contract to make sure that the account claiming is doing so in a way that matches
the root hash proposal.

###### Security Notes
  - Contract can verify accounts after correct root hash was determined

##### claimFeeFor
Arguments:
  - `_who`      (address) - fee recipient
  - `_proposer` (address) - the roothash proposer address

Allows to claim fee.
If root hash is successful the proposer gets the proposer fee back + all the challenge fees.
If the proposed root hash is rejected, proposer fee is distributed among the challengers (weighted by number of challenges).
The challengers also have their staked challenge returned in full.

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

#### Lockup
  - Inherits: `PolicedUtils`

Provides deposit certificate functionality, used to slow down the rate of
spending. Is a template contract that is cloned and initialized when it is
offered (as the result of a `CurrencyGovernance` vote) by the `CurrencyTimer`
contract on the start of a new generation.

The deposit certificates system operates operates in three parts. First, during
the sale period, currency holders are able to make deposits. Then, during the
lockup period, deposit holders are able to withdraw but at a penalty. Finally,
at the end of the lockup period deposit holders are able to withdraw their initial
deposit along with the promised interest.

Interest is stored as a 9 digit fixed point number and is calculated via integer
multiplication and truncated division.

##### Events
###### Sale
Attributes:
  - `to` (address) - the address that a certificate was sold/issued to
  - `amount` (uint256) - the amount of tokens deposited in the certificate

Indicates the sale of a deposit certificate.

###### Withdrawal
Attributes:
  - `to` (address) - the address withdrawing from the certificate
  - `amount` (uint256) - the amount of tokens withdrawn

Indicates the withdrawal of funds from a deposit certificate.

##### deposit
Arguments:
  - `_amount` (uint256) - the amount to deposit

Transfers funds from the caller's balance to this contract and records the deposited amount. The transfer from the caller's balance must be approved before this method is called. Does not effect the users' or their delegates' voting amount

Can be called multiple times to increase the amount deposited, but withdrawals are not possible until after the end of the sale period.

Emits the `Sale` event.

###### Security Notes
  - Can only be called during the sale period.
  - Transfer permissions are assumed, and must be granted before this method is called.

##### withdraw
Arguments: none

If called after the end of the lockup period, transfer the initial deposit amount then calls to `CurrencyTimer` to mint the promised interest earned to the deposit holder. If called before the end of the lockup period, transfer the initial deposit amount then calls to `CurrencyTimer` to burn the promised interest earned (as a penalty for early withdrawal) for the deposit holder.

Emits the `Withdrawal` event.

Identical to `withdrawFor` on behalf of the caller (`msg.sender`), allowing for
deposits to be withdrawn early.

###### Security Notes
  - The calling address must have made a deposit.
  - `CurrencyTimer` is delegated the responsibity of giving interest or burning the penalty to not effect delegation.

##### withdrawFor
Arguments:
  - `_owner` (address) - the address of the account to withdraw on behalf of

Identical to `withdraw` except may not be withdrawn early, but may be executed
for any address with a valid deposit that has waited the full period.

###### Security Notes
  - May only be called after the lockup period has ended.
  - `_owner` must have made a deposit.
  - Transfers are always made to the account of `_owner`.

##### selling
Arguments: none

Returns `true` if the contract is within the generation where it is selling
lockups, otherwise returns `false`.

##### destruct
Arguments: none

Sends all tokens back to the root policy and self-destructs the contract.

###### Security Notes
  - Can only be called after every deposit has been withdrawn.
  - Cannot be called during the sale period.

#### TrustedNodes
  - Inherits: `PolicedUtils`

Provides a registry of trustees, and allows the root policy contract to
grant or revoke trust. The nodes are stored in the array `trustedNodes` along
with the mapping `trusteeNumber` which maps addresses to a number greater than
zero if they are trusted, corrresponding to theic position in `trustedNodes`, and
maps them to zero if they are not trusted.

Trusted nodes participate in the inflation/deflation voting process. They can be
added and removed using policy proposals.

##### Events
###### TrustedNodeAdded
Attributes:
  - `node` (address) the address of the new trusted node

Emitted by the `trust` function.

###### TrustedNodeRemoved
Attributes:
  - `node` (address) the address of the old trusted node removed

Emitted by the `distrust` function.

##### trust
Arguments:
  - `_node` (address) - the node to grant trust to

Grants trust to a node.

##### distrust
Arguments:
  - `_node` (address) - the node to revoke trust in

Revokes trust in a node.

##### numTrustees
Arguments: none

Returns the length of `trustedNodes` minus 1 which is the current number of trustees

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md).
