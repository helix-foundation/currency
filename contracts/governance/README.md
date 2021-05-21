# Inflation and Governance System
> Inflation and governance policies for the Eco currency.

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
The security of the governance contracts is built on a list of trusted nodes.
See the `TrustedNodes` contract for how the list maintained. Changes to the
list of trusted nodes can be made using policy proposals, and require the
support of a 3/4ths majority of participating voters, weighted by stake.

## Background
The inflation and governance contracts provide a policy hierarchy (built in
Eco's policy framework). It allows Eco's trusted nodes (a list of which is
managed by a `TrustedNodes` instance) to enact inflationary or deflationary
measures, and allows all stake-holders in the currency to participate in
elections for broader changes to the currency or how it's governed.

The `TimedPolicies` contract implements the schedule for periodic votes, and
instantiates (by cloning) the appropriate contracts for each type of vote. There
are two distinct types of periodic votes:
 - Inflation/Deflation Decisions
 - General Policy Decisions

Each type of periodic vote has a different schedule, and different rules around
who participates.

### Inflation/Deflation Decisions
> Note that the vote frequency is likely to change based on feedback and
> observed use. It is bounded below by the VDF safety margins, setting a
> maximum frequency of once every five days. 14 days was selected based on
> estimates of how long it would take to observe the impact of a previous vote.

Inflation/Deflation Decisions happen every 14 days, and involve only the Trusted
Nodes. They're used to create and distribute new currency (to drive spending) or
to create and distribute deposit certificates (to discourage spending). In both
cases new currency is created, but the distribution mechanism is designed to
reward different behavior.

The general workflow and timeline are outlined in the diagram below:
[![Monetary Governance Workflow](../../doc/inflation-voting-workflow.thumb.png?raw=true)](https://www.lucidchart.com/publicSegments/view/1dc95b9d-ecb7-4f19-94d3-4790075acf5a/image.png)

#### Inflation
An inflation vote creates new currency and distributes it randomly to anyone who
held currency at the end of the last cycle. No registration is required, and each
currency holder has an equal probability of receiving a share of the newly
minted currency.

#### Deflation
Deflation (or a similar slowing of the economy) is achieved by issuing deposit
certificates that bear interest. Deposit certificates are sold, and the
certificate holders receive newly created currency as interest on their
deposits.

### Policy Decisions
> Note that the vote frequency described below is likely to change based on
> feedback and voter behavior. 40 days was selected based on anticipated
> duration of the interest payout period so that only one cycle is paying out
> at a time.

The Policy Decisions process runs every 40 days and provides a mechanism for
upgrading contracts or making other changes to the currency system. For example,
the frequency of policy decisions could be modified by using the policy
decisions process to replace the `TimedPolicies` contract with a new version
using a different policy decision frequency.

The process runs in three phases, the proposals phase, the voting phase, and the
veto phase. During the proposals phase any currency holder may submit a proposal
in the form of a contract to be executed and some currency staked to support the
proposal. The top proposals (by stake) will progress to the voting phase where
any currency holder may vote either for or against any number of proposals. At
the end of the voting phase there is a brief veto period during which the
outcome of the voting phase can be completely discarded by a stake vote with
more staked than the aggregate stake in favour of the proposals.

[![Network Governance Process](../../doc/network-governance.thumb.png?raw=true)](https://www.lucidchart.com/publicSegments/view/93eba41d-ee24-4511-bc8d-62075584ad2b/image.png)

## Install
See the [main README](../../README.md) for installation instructions.

## Usage
The inflation contracts deploy as a policy hierarchy implemented in Eco's
[policy framework](../policy/README.md). The `TimedPolicies` contract should be
deployed as the "TimedPolicies" policy object, and is constructed with references to
the other contracts needed for specific votes and outcomes.

The `TimedPolicies` contract will clone the referenced contracts as needed, and
grant the clones the relevant permissions. See `startInflation` for an example.

## API
Each section here discusses the API used to interact with one part of the
governance process, starting with the contract overseeing periodic voting and
moving on to the periodic voting processes themselves.

### TimedPolicies
 - Inherits: `Policed`

The `TimedPolicies` contract manages the time-based recurring processes that
form the governance system. There are two such processes:
 - Inflation/Deflation Votes
 - Policy Votes

Each of the processes follows a different time-line, but both happen regularly.

#### Process Overview
##### Inflation/Deflation Votes
Recurring with a period of `TimedPolicies.INFLATION_TIME` (currently 14 days),
inflation/deflation votes allow the creation of new tokens and are used to
either encourage or discourage the spending of the currency in order to keep
the relative value somewhat stable.

##### Policy Votes
Recurring with a period of `TimedPolicies.POLICY_TIME` (currently 40 days),
policy votes are used to oversee the entire currency system. Contract upgrades,
changes to voting frequencies, and one-off actions are possible through the
policy voting system.

#### Events
##### CurrencyGovernanceDecisionStarted
Attributes:
 - `_address` (address) - the address of the `Inflation` contract supervising
   the vote

Indicates the start of a currency governance vote.

##### PolicyDecisionStarted
Attributes:
 - `_address` (address) - the address of the `PolicyProposals` contract
   supervising the vote

Indicates the start of a policy vote.

#### startCurrencyGovernance
Takes no arguments.

Begins a new currency governance vote. A new instance of the
`CurrencyGovernance` contract is created and granted permission to act as the
currency governance provider for the duration of the vote (it will remove itself
on completion).

The address of the new contract can be found by querying the root policy address
for the `CurrencyGovernance` policy provider.

A `CurrencyGovernanceDecisionStarted` event is omitted, with the address of the
`CurrencyGovernance` contract, to indicate the start of a new vote.

##### Security Notes
 - This method can only be invoked at most once every
   `TimedPolicies.INFLATION_TIME` (currently 14 days), but can be invoked by
   anyone who wishes to begin a new inflation/deflation vote.

#### startPolicyProposal
Takes no arguments.

Begins a new policy voting process. A new instance of the `PolicyProposals`
contract is created and granted appropriate permissions.

The address of the new contract can be found by querying the root policy address
for the `PolicyProposals` policy provider.

A `PolicyDecisionStarted` event is emitted with the `PolicyProposals` contract
address to indicate the start of a new vote.

##### Security Notes
 - This method can only be invoked at most once every
   `TimedPolicies.POLICY_TIME` (currently 40 days), but can be invoked by anyone
   who wishes to begin a new policy voting process.

### Inflation/Deflation Decisions
#### Inflation
 - Inherits: `PolicedUtils`

##### Events
###### CommitmentMade
Attributes:
 - `_voter` (indexed address) - the address of the participant that cast the
   ballot
 - `_keyVDFSeed` (bytes32) - the start point of the VDF function used to
   encrypt the commitment

Indicates that a voter has committed to a ballot and the forced-reveal process
can start.

###### VoteRevealed
Attributes:
 - `_voter` (indexed address) - the address of the participant that cast the
   ballot
 - `_inflation` (uint256) - the amount of inflation indicated by the ballot
 - `_prize` (uint256) - the amount of tokens to be awarded to each recipient of
   any inflation, as indicated by the ballot
 - `_certificatesTotal` (uint256) - the token value of certificates to be
   issued, as indicated by the ballot
 - `_interest` (uint256) - the quantity of tokens to pay out as interest, shared
   between all certificate holders, as indicated by the ballot

Indicates that an inflation/deflation vote participant has revealed their vote,
and creates a permanent record of the vote.

###### VoteDiscarded
Attributes:
 - `_voter` (indexed address) - the address of the participant that cast the
   ballot
 - `_inflation` (uint256) - the amount of inflation indicated by the ballot
 - `_prize` (uint256) - the amount of tokens to be awarded to each recipient of
   any inflation, as indicated by the ballot
 - `_certificatesTotal` (uint256) - the token value of certificates to be
   issued, as indicated by the ballot
 - `_interest` (uint256) - the quantity of tokens to pay out as interest, shared
   between all certificate holders, as indicated by the ballot

Indicates that a ballot was found to be invalid during the reveal process. The
ballot has been discarded and will no longer be counted towards the total number
of votes.

###### VoteResults
Attributes:
 - `_inflation` (uint256) - the total amount of new tokens to add to the economy
 - `_prize` (uint256) - the portion of new tokens to give to each recipient
 - `_certificatesTotal` (uint256) - the total token value of certificates to be
   issued
 - `_interest` (uint256) - the quantity of tokens to pay out as interest, shared
   among all certificate holders

Indicates the end of an inflation/deflation vote, and acts as a permanent record
of the outcome.

###### DepositCertificatesOffered
Attributes:
 - `_address` (indexed address) - the address of the contract supervising the
   issued certificates

Indicates the offer of deposit certificates so that token holders can begin
purchasing them. Informs token holders where to find the certificate sale
contract.

##### commit
Takes two arguments:
 - `_encryptedVote` - a commitment to a particular vote ballot (to be decrypted
   in the future)
 - `_keyVDFSeed` - the start value for the VDF used to encrypt the ballot

Commit a trusted node to a particular vote without revealing information about
what that vote may be.

A commitment is the packed ABI encoding of the ballot parameters, encrypted
using a symmetric encryption scheme. In Solidity, the plaintext commitment can
be encoded using `abi.encodePacked`:
```
function encodeBallot(
    uint256 inflation,
    uint256 prize,
    uint256 certificatesTotal,
    uint128 interest
    )
    internal
    pure
    returns (bytes memory)
{
    return abi.encodePacked(
        inflation,
        prize,
        certificatesTotal,
        interest
        );
}
```

A key stream is generated from the output of the VDF (pseudocode):
```
bytes vdfResult = computeVDF(_keyVDFSeed);
bytes memory key = expandKey(vdfResult, keyLength);
```

The resulting bytes are then XOR-ed with the key stream to form the encrypted
ballot commitment (pseudocode):
```
bytes memory raw = encodeBallot(inflation, prize, certificatesTotal, interest);
bytes memory key = expandKey(computeVDF(_keyVDFSeed), raw.length);
bytes memory encryptedVote = raw ^ key;
```

> A node may not vote for both inflation and deposit certificates! Either
> `inflation` or `certificatesTotal` must be 0. There is no way to enforce this
> constraint here, but it is enforced by the `reveal` method.

Emits the `CommitmentMade` event to indicate that off-chain processes should
start computing the VDF result.

###### Security Notes
 - Can only be called by trusted nodes.
 - Can only be called during the commitment phase of the voting process.

##### reveal
Takes two arguments:
 - `_voter` (address) - the voter whose vote will be revealed
 - `_keyVDFResult` (bytes) - the result of the VDF function, in big endian
   encoding

Reveals a ballot that was previously committed to. This is called during the
reveal phase of the voting process and is used to record the votes of all the
trusted nodes. See details on the `commit` method for specifics on the process
and relationship between `commit` and `reveal`.

> If a vote is found to be invalid after decryption the vote will be discarded
> with no opportunity for adjustment or correction. A vote is invalid if both
> `inflation` and `certificatesTotal` are non-zero.

Emits the `VoteRevealed` event to create a record of the vote in the log. These
events are used by the client to display information about the historical voting
decisions of each participant.

Emits the `VoteDiscarded` event if a vote is found to be invalid during the
reveal process.

###### Security Notes
 - Can only be called by accounts that have previously committed to a ballot by
   calling `commit` (and therefore are a trusted node).
 - The parameters must, when hashed together, match the value provided to the
   `commit` method during the commit phase.
 - Can only be called during the reveal phase.
 - If `_inflation` and `_prize` are non-zero then `_certificatesTotal` and
   `_interest` must be zero. Likewise in reverse. This prevents a node from
   voting both to encourage and discourage spending.

##### computeVote
Takes four arguments:
 - `_inflationOrder` - an array of addresses casting revealed votes, sorted by
   the inflation value they voted for
 - `_prizeOrder` - an array of addresses casting revealed votes, sorted by the
   the per-stakeholder prize value they voted for
 - `_certificatesTotalOrder` - an array of addresses casting revealed votes,
   sorted by the total value of certificates they voted to issue
 - `_interestOrder` - an array of addresses casting revealed votes, sorted by
   the amount of interest they voted to distribute among certificate holders

Computes the median inflation, prize, certificates total, and interest values,
and sets the vote results to those values. If appropriate, begins the inflation
lottery or certificates sale.

The array parameters are expected to be ordered to avoid on-chain sorting.

Emits the `VoteResults` event to indicate the end of the voting process and
establish an accessible permanent record of the outcome. If the outcome of the
vote results in the issue of certificates then the `DepositCertificatesOffered`
event will also be emitted, indicating the location of the governing contract.

###### Security Notes
 - Provided arrays must be ordered. Ordering is verified before computing the
   medians.
 - Provided array lengths must match the number of revealed ballots.
 - Medians are used instead of averages to prevent rogue voters from excessively
   skewing results.
 - Can only be called after the end of the reveal phase.
 - Can only be called once on any given inflation contract.

##### claimFor
Takes four arguments:
 - `_who` - the address to claim a ticket on behalf of
 - `_sequence` - the sequence number of the ticket to claim
 - `_proof` - the “other nodes” in the merkle tree.
 - `_sum` -  cumulative sum of all account balances before this node (See InflationRootHashProposal)

Pays out inflation rewards to `_who` if the provided sequence number is in the
set of winners. See InflationRootHashProposal contract to understand how tickets distributed.

###### Security Notes
 - This will only pay out if `_who` holds a winning ticket.
 - Can only be called after the end of the results have been computed.
 - This method limits its call rate to prevent a rapid flood of new currency
   entering circulation at the same time.

##### claim
Takes three arguments:
 - `_sequence` - the sequence number of the ticket to claim
 - `_proof` - the “other nodes” in the merkle tree.
 - `_sum` -  cumulative sum of all account balances before this node (See InflationRootHashProposal)

Claims an inflation reward ticket on behalf of `_msgSender()`. See `claimFor` for
details.

##### destruct
Takes no arguments.

Self-destructs the inflation contract, ending the voting cycle.

###### Security Notes
 - Can only be called after the vote results are computed and all winning
   tickets have been claimed.

#### InflationRootHashProposal
 - Inherits: `PolicedUtils`, `TimeUtils`
To distribute Inflation rewards we need to establish winners of the "Inflation lottery". Inflation contract responsible to generate "winning tickets". While InflationRootHashProposal helps to establish which user holds what ticket.

We assume that all users would always obtain tickets. Then, when claiming a reward, the user simply posts a proof stating that “if all users had gotten tickets, then I would have had ticket numbers from X to Y”; and if that range overlaps a winning ticket number, they get paid.

Assume that there exists a Merkle tree based on a list of nodes, where each node contains the following:
Account number
Account balance
The cumulative sum of all account balances before this node.
The cumulative sum of the node represents the start of the user's ticket range.

The list is sorted by ascending account number, and the Merkle root hash exists.
Thus, assuming ticket X was a winner, the account holder of that can prove it by submitting:
The index in the tree
The cumulative sum before me
The “other side” of the Merkle tree

The contract can then hash account number, balance, and the cumulative sum to get the node hash, then using the supplied other side of the Merkle tree verify that submission hashes up to the root hash. Ergo the proof is correct.

If the user submits the wrong index or cumulative sum, the root hash will be wrong. To simplify verification of trees, the number of nodes is always a power of two, and the extra nodes must have account, balance, and sum set to 0.

To achieve it we need to establish a correct root hash for every generation. Since the construction of an ordered list of all accounts would be expensive on the chain, the purpose of this contract is to allow the third party to propose a root hash correctly representing Merkle tree of all the accounts arranged as described above and let other parties verify submissions and challenge it in case the submission is wrong.

##### Events
###### RootHashChallengeIndexRequestAdded
Attributes:
 - `proposer` (address) - proposer of the root hash being challenged
 - `challenger` (address) - address of the submitter of the challenge
 - `rootHash` (uint256) - root hash being challenged
 - `index` (uint256) - which index of the tree proposer required to prove

Indicates that the root hash is challenged and proposer required to respond with the proof of a specific index.

###### ChallengeResponseVerified
Attributes:
 - `proposedRootHash` (uint256) - root hash being challenged
 - `challenger` (address) - address of the submitter of the challenge
 - `account` (address) - address of the account being challenged
 - `balance` (uint256) - balance at generation of the account being challenged
 - `sum` (uint256) - cumulative sum of the account being challenged
 - `index` (uint256) - index in the merkle tree of the account being challenged

Indicates that submitted response to a challenge was successfully verified.

###### RootHashProposed
Attributes:
 - `proposedRootHash` (uint256) - the proposed root hash of the merkle tree representing accounts in the system
 - `totalSum` (uint256) - total cumulative sum of all the balances (sum of the last node + its balance) 
 - `amountOfAccounts` (uint256) - total number of the accounts in the merkle tree
 - `proposer` (address) - address of the proposer of the root hash

Indicates that the new root hash proposal was submitted to the system

###### RootHashRejected
Attributes:
 - `proposedRootHash` (uint256) - the rejected root hash
 - `totalSum` (uint256) - total cumulative sum of all the balances of this proposal
 - `amountOfAccounts` (uint256) - total number of the accounts in the merkle tree of this proposal
 - `proposer` (address) - address of the proposer of rejected root hash

Indicates that root hash was proved to be wrong or timed out on unanswered challenged and been rejected

###### RootHashAccepted
Attributes:
 - `proposedRootHash` (uint256) - the accepted root hash
 - `totalSum` (uint256) - total cumulative sum of all the balances of this proposal
 - `amountOfAccounts` (uint256) - total number of the accounts in the merkle tree of this proposal
 - `proposer` (address) - address of the proposer of accepted root hash

Indicates that a new root hash proposal was accepted by the system, now winners can claim inflation rewards

###### ChallengeMissingAccountSuccess
Attributes:
 - `proposer` (address) - the roothash proposal address
 - `proposedRootHash` (uint256) - the proposed root hash of the merkle tree representing accounts in the system
 - `challenger` (address) - address of the submitter of the challenge
 - `missingAccount` (address) - address of the account being claimed missing

Indicates that a missing account challenge was successful, challenged root hash will be rejected

##### configure
Takes one argument:
 - `_generation` - A balance store generation the contract will establish root hash for

Configures an InflationRootHashProposal setting a balance store generation for which contract will establish root hash.

###### Security Notes
 - Can be run only once during cloning of the contract
    
##### proposeRootHash
Takes three arguments:
  - `_proposedRootHash` (uint256) - the proposed root hash of the merkle tree representing accounts in the system
  - `_totalSum`         (uint256) - total cumulative sum of all the balances
  - `_amountOfAccounts` (uint256) - total number of the accounts in the merkle tree

Allows to propose new root hash to the system

###### Security Notes
 - new proposals allowed before root hash is accepted

##### challengeRootHashRequestAccount
Takes three arguments:
  - `_proposer`           (address) - the roothash proposer address
  - `_challengedRootHash` (uint256) - root hash being challenged
  - `_requestedIndex`     (uint256) - index in the merkle tree of the account being challenged

Allows to challenge previously proposed root hash. Challenge requires proposer of the root hash submit proof of the account for requested index

###### Security Notes
 - new challenges allowed before root hash is accepted
 - new challengers can submit a challenge 24 hours after root hash was proposed.
 - Total amount of 2 log N + 2 challenges are allowed.


##### claimMissingAccount
Takes four arguments:
  - `_proposer`           (address) - the roothash proposer address
  - `_challengedRootHash` (uint256) - root hash being challenged
  - `_index`              (uint256) - index in the merkle tree of the account being challenged
  - `_account`            (address) - address of the missing account

A special challenge, the challenger can claim that an account is missing, which it does by saying “index X should be account A”. 
“X” and “X-1” must have been previously challenged, and if the contract sees that A has a balance, 
and account(X) > A > account(x-1), then the proposal is rejected.

###### Security Notes
 - new challenges allowed before root hash is accepted
    
##### respondToChallenge
Takes seven arguments:
  - `_rootHash`       (uint256)   - root hash prove submitted for
  - `_challenger`     (address)   - address of the submitter of the challenge
  - `_proof`          (bytes32[]) - the “other nodes” in the merkle tree.
  - `_account`        (address)   - address of an account of challenged index in the tree
  - `_claimedBalance` (uint256)   - balance of an account of challenged index in the tree
  - `_sum`            (uint256)   - cumulative sum of an account of challenged index in the tree
  - `_index`          (uint256)   - index in the merkle tree being answered

Allows to proposer of the root hash respond to a challenge of specific index with pro details

###### Security Notes
 - Only proposer of the root hash can respond to a challenge
 - Proposer has a limited amount of time to respond to each challenge. For each challenger, this is proposed as 24 hours in total + 1 hour per challenge issued

##### checkRootHashStatus
Takes two arguments:
 -`_proposer` (address) - the roothash proposer address
 -`_rootHash` (uint256) - root hash being checked
Takes no arguments.

Checks root hash proposal. If time is out and there is unanswered challenges proposal is rejected. If time to submit
new challenges is over and there is no unanswered challenges, root hash is accepted.

###### Security Notes
 - There are no specific restrictions on this method

##### verifyClaimSubmission
Takes three arguments:
  - `_who_`   (address)   - address of an account claiming win
  - `_proof`  (bytes32[]) - the “other nodes” in the merkle tree.
  - `_sum`    (uint256)   - cumulative sum of a claiming account 

Verify that account associated with cumulative sum in accepted merkle tree for the current generation.

###### Security Notes
 - Contract can verify accounts after correct root hash was determined

##### claimFeeFor
Takes three arguments:
 -`_who`      (address) - fee recipient
 -`_proposer` (address) - the roothash proposer address
 -`_rootHash` (uint256) - root hash being checked

Allows to claim fee.
If root hash is successful the proposer gets the proposer fee back + all the challenge fees.
If the proposed root hash is rejected, proposer fee is distributed among the challengers (weighted by number of challenges).
The challengers also have their staked challenge returned in full.

###### Security Notes
 - fees distributed after root hash has been accepted or rejected
 
##### claimFee
Takes three arguments:
 -`_proposer` (address) - the roothash proposer address
 -`_rootHash` (uint256) - root hash being checked

Allows to claim fee on behalf of the caller (`msg.sender`).
See claimFeeFor

###### Security Notes
 - fees distributed after root hash has been accepted or rejected

##### destruct
Takes no arguments.

Self-destructs the inflation root hash proposal contract.

###### Security Notes
 - Can only be called after the end fee collection period.
 - Any ECO deposited to the contract is transferred to the policy.
 - Any ETH deposited to the contract is burned.


#### DepositCertificates
 - Inherits: `PolicedUtils`

Provides deposit certificate functionality, used to slow down the rate of
spending if an inflation/deflation vote indicates that it is necessary.

The deposit certificates system operates operates in three parts. First, during
the sale period, currency holders are able to make deposits. Then, during the
lockup period, deposit holders are able to withdraw earned interest to date at
any time. Finally, at the end of the lockup period deposit holders are able to
withdraw their initial deposit plus any remaining interest.

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
 - `_final` (bool) - true if there are no funds left after this withdrawal

Indicates the withdrawal of funds (interest, or interest + principal) from a
deposit certificate.

##### deposit
Takes one argument:
 - `_amount` - the amount to deposit

With raws funds from the caller's balance and issues a deposit certificate in
return. The transfer from the caller's balance must be approved before this
method is called.

Can be called multiple times to increase the amount deposited, but withdrawals
are not possible until after the end of the sale period.

Emits the `Sale` event.

###### Security Notes
 - Can only be called during the sale period.
 - The sum of the amount in all successful calls to deposit can never exceed the
   `certificatesTotal`.
 - Transfer permissions are assumed, and must be granted before this method is
   called.

##### withdraw
Takes no arguments.

Executes a `withdrawFor` on behalf of the caller (`_msgSender()`).

###### Security Notes
 - There are no specific restrictions on this method, but all restrictions from
   `withdrawFor` will apply.

##### withdrawFor
Takes one argument:
 - `_owner` - the address of the account to withdraw on behalf of

During the lockup period, transfer any remaining interest earned (to date) to
the deposit holder (`_owner`). After the end of the lockup period, transfer the
initial deposit amount plus any remaining interest earned to the deposit holder.

Emits the `Withdrawal` event.

###### Security Notes
 - Can only be called after the end of the sale period.
 - `_owner` must have made a deposit and cannot have withdrawn their principal.
 - At least one interest period must have passed since the end of the sale
   period.
 - Transfers are always made to the account of `_owner`.

##### destruct
Takes no arguments.

Self-destructs the deposit certificates contract.

###### Security Notes
 - Can only be called after the end of the lockup period.
 - Can only be called after all deposits and interest have been withdrawn.
 - Any ETH deposited to the contract is transferred to the policy.
 - Any unearned interest tokens are burned.

##### startSale
Takes two arguments:
 - `_certificatesTotal` - the maximum total value of all certificates
 - `_interest` - the quantity of interest to distribute among depositors

Starts a new deposit sale. The tokens necessary to cover interest payments must
already been in the contract's balance.

###### Security Notes
 - Can only be called once.
 - Should be called atomically with instantiation.

#### TrustedNodes
 - Inherits: `PolicedUtils`

Provides a registry of trusted nodes, and allows the root policy contract to
grant or revoke trust.

Trusted nodes participate in the inflation/deflation voting process. They can be
added and removed using policy proposals.

##### trust
Takes one argument:
 - `_node` - the node to grant trust to

Grants trust to a node.

##### distrust
Takes one argument:
 - `_node` - the node to revoke trust in

Revokes trust in a node.

##### isTrusted
Takes on argument:
 - `_node` - the node to enquire about

Determines if the given node is trusted.

### Policy Decisions
#### PolicyProposals
##### registerProposal
Takes one argument:
 - `_prop` - the address of the proposal contract

Register a new proposal for inclusion in the policy voting ballot. Registration
is necessary but does not guarantee inclusion.

To be included on the ballot a proposal must receive enough support to be in the
top 10 proposals registered in a decision process.

Registering a proposal requires a deposit of `COST_REGISTER` tokens (currently
1000), which is transferred from the caller's balance. Approval of the transfer
must be done before calling `registerProposal`. If the proposal does not make it
onto the ballot then the caller will receive a refund of `REFUND_IF_LOST` tokens
(currently 800).
> Note that numbers are in whole tokens, where each token is represented as
> `1x10^18`.

###### Security Notes
 - Requires payment to call, to prevent abuse.
 - A proposal can only be registered once.
 - Proposals can only be registered during the proposal period.

##### getProposal
Takes one argument:
 - `_prop` - the address of the proposal contract

Returns:
 - (address) the proposal address
 - (address) the proposing account address
 - (uint256) the amount of stake supporting the proposal

Returns information on how much supporting stake a proposal has, and which
account registered the proposal for consideration.

##### support
Takes one argument:
 - `_prop` - the proposal to support

Proposals require the support of one or more currency holders in order to get
on the policy decision ballot. The `support` method allows currency holders to
indicate their support for a proposal. The caller's balance at the end of the
last inflation period is added to the total supporting stake for the proposal,
and the proposal is placed in the appropriate position in the ballot list (if
there's enough stake to get on the ballot).

Note that the supporting stake is not withdrawn from the caller's balance.
Instead, the caller's balance at the last checkpoint in the balance store is
used. This prevents the same tokens from being used by multiple different
accounts without requiring that funds be locked up or spent.

See the [Currency](../contracts/currency) documentation for details on the
generational balance store and checkpoints.

###### Security Notes
 - Can only be called during the staking period.
 - Can only be called by an account that held tokens at the last checkpoint.
 - Must be provided the address of a registered proposal.
 - Can only be called once for each proposal by any given account.

##### compute
Takes no arguments.

Computes the set of proposals that belong on the ballot and begins the vote on
which proposals to enact. After `compute` has been called the vote contract can
be found by looking up the `PolicyVotes` policy.

###### Security Notes
 - Can only be called after the end of the staking period.
 - Can only be called once.

##### refund
Takes one argument:
 - `_prop` - the proposal to refund the fee for

Refunds (partially) the fee for the registration of a proposal that did not
make it onto the ballot.

###### Security Notes
 - Can only be called after `compute` has been called.
 - Always issues the refund to the original proposer.
 - Can only be called for proposals that did not make it onto the ballot.

##### destruct
Takes no arguments.

Self-destructs the contract, freeing all storage. Any ETH held is transferred to
the root policy contract.

###### Security Notes
 - Can only be called after all proposals have been refunded.
 - Can only be called after `compute` has been called.

#### PolicyVotes
##### configure
Takes one argument:
 - `_proposals` - an array of proposal contract addresses to place on the ballot

Configures a policy vote, setting the policies to be voted on and the times at
which different voting periods end.

###### Security Notes
 - Should be called atomically with instantiation.
 - Can only be called once.

##### reorder
Takes one argument:
 - `_order` - the new ordering of proposals on the ballot

Change the order of proposals on the ballot.

###### Security Notes
 - Can only be called by the `EcoLabs` policy.
 - Can only re-order proposals, cannot add or remove them.

##### commit
Takes one argument:
 - `_commitment` - the hash of the arguments to be passed to `reveal` in the
   future

Commit to a future vote value. Used during the commit portion of the
commit-and-reveal voting workflow. Can be called again to change the commitment
at any time prior to the end of the commitment period.

Be sure to check the constraints on `reveal` before constructing a commitment.

JavaScript example of constructing a commitment:
```javascript
const commitment = web3.utils.soliditySha3(
  { value: seed, type: 'bytes32' },
  [ proposalAddress1, proposalAddress2 ],
);
```

###### Security Notes
 - Can only be called during the commitment period.
 - Can only be called by an account that held tokens at the last checkpoint.
 - `_commitment` must be valid, but this cannot be verified until `reveal` is
   called.

##### reveal
Takes 2 arguments:
 - `_seed` - a nonce used to obscure the vote value
 - `_yesVotes` - a list of proposals to vote in favour of

Reveal a vote that has been previously committed to. The vote is cast in favour
of all proposals listed in `_yesVotes`.

The vote is checked against the commitment passed to `commit` during the
commitment period:
```
require(keccak256(abi.encodePacked(_seed, _yesVotes)) == _commitment);
```

###### Security Notes
 - Must have a prior commitment.
 - Prior commitment must match the hash of the vote parameters.
 - Can only vote for proposals on the ballot.
 - Can only be called during the reveal period.
 - Can only be called by accounts that held tokens at the last checkpoint.
 - Can only be called once by each account.
 - Each proposal may appear at most once in the `_yesVotes` list.

##### challenge
Takes no arguments.

Casts a vote to veto the entire ballot. If the sum of the stakes of all veto
votes exceeds the 3/4 of all supporting vote stakes then the entire ballot is
discarded.

###### Security Notes
 - Vetoes are weighted by currency held at the last checkpoint, so calling
   multiple times isn't a problem.
 - Can be called at any time.

##### execute
Takes no arguments.

Self-destructs the contract. If the vote has not be vetoed, determine which
proposals have passed and enact them before self-destructing.

###### Security Notes
 - Enacted proposals can do anything they like. They're run in the context of
   the root policy using `delegatecall`, allowing them to use `delegatecall` on
   behalf of any managed contract.
 - Can only be called after the challenge period ends.

##### proposalOrder
Takes no arguments.

Returns a list of proposals, in order for display.

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md).
