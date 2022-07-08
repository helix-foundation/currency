# Community Governance System
> Community governance policies for the Eco currency.

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


### Community Governance
The Community Governance process provides a mechanism for upgrading contracts or
making other changes to the currency or governance system. For example, the
length of a generation could be modified by using the policy decisions process
to replace the `TimedPolicies` contract with a new version using a different
generational frequency.

The process has two phases. Starting at the beginning of a generation,
any currency holder may submit a proposal in the form of a contract to be executed
along with a submission fee. During this period, any address can give and modify
support to these proposals where the voting power is based on the most recent
snapshot of their ECO and ECOx balances. If any proposal reaches support exceeding
30% of the total available voting power in the system, it will progress to the
voting phase where any currency holder may vote either for or against it using the
same calculation of voting power as the supporting of the proposal. At the end of
the 72 hour voting phase, the proposal passes iff it has more yes votes than no
votes. However, if the yes votes do not consist of a majority of the total voting
power, there is a 24 hour delay to implementation. Proposals that were submitted
but not voted on entitle the proposer to a partial refund of the fee as soon as
the proposing phase ends.

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


### Community Governance

#### VotingPower
  - Inherits: `PolicedUtils`

This contract is for `PolicyProposals` and `PolicyVotes` inherit the functionality
for computing voting power for any address. The voting power calculation is such
that one ECO recorded in the generational snapshot is one vote and each ECOx that
is likewise snapshotted has a voting power equal to it's value at the generation
snapshot at question. See the [currency](../currency/README.md) documentation for more explanation
about each currency and the generational store. Currency stored in a `Lockup`
contract also contribute to this voting power.

##### votingPower
Arguments:
  - `_who` (address) - the address's voting power to compute
  - `_generation` (uint256) - the generation at which to compute the voting power.
  - `_lockups` (uint256[]) - an array of each generation of lockups to check for user balance.

Computes and returns the voting power for the address.

###### Security Notes
  - Fails if lockups newer than the specified generation are submitted.
  - Fails if specified a lockup when none existed for that generation.

##### totalVotingPower
Arguments:
  - `_gen` (uint256) - the generation at which to compute.

Computes the voting power using the `totalSupplyAt` for ECO and ECOx.

#### PolicyProposals
  - Inherits: `VotingPower`

This contract controls the first half of the policy voting process where users
submit and support proposed changes to the codebase. Proposals are submitted at
anytime during a generation, for a fee, and are then open for public review.
Proposals that are changing parts of the governance system will likely have to
have updated versions of the contracts to be changed as secondary contracts.
The `Proposal` abstract contract template gives accessor functions to `name`,
`description`, and `url` properties to give the proposer venue to explain
everything involved.

Once a proposal is submitted, addresses can `support` (see function below) the
proposal with their voting power (see `VotingPower`). If any proposal is supported
by 30% or more of the total available voting power, a vote for that proposal is
triggered. A `PolicyVotes` contract is cloned and given the information about
the proposal, followed by the clone of `PolicyProposals` shutting down. Any other
proposal must be submitted again during the next generation, but its submitter
is able to recoup some of the fee.

##### Events
###### Register
Attributes:
  - `proposer` (address) - the address submitting the proposal
  - `proposalAddress` (address) - the address of the submitted proposal

Emitted on successful submission of a new proposal.

###### Support
Attributes:
  - `supporter` (address) - the address that supported the proposal
  - `proposalAddress` (address) - the address of the proposal being supported

Emitted when `support` is successfully called. Helps external systems keep tabs
on the supporting process.

###### Unsupport
Attributes:
  - `unsupporter` (address) - the address that supported the proposal
  - `proposalAddress` (address) - the address of the proposal being supported

Emitted when `unsupport` is successfully called. Helps external systems keep tabs
on the supporting process.

##### SupportThresholdReached
Attributes:
  - `proposalAddress` (address) - the address of the proposal that reached the threshold

Emitted when a proposal crosses the support threshold and is ready to be voted on.
Indicates that deployProposalVoting can and should now be called.

###### VoteStart
Attributes:
  - `contractAddress` (address) - the address of the `PolicyVotes` contract, overseeing the vote.

Emitted once a proposal has reached sufficient support and voting has been started.

###### ProposalRefund
Attributes:
  - `proposer` (address) - the address of the proposal's initial submitter

Emitted when an unsuccessful proposer recoups a part of their fee.

##### registerProposal
Arguments:
  - `_prop` (address) - the address of the proposal contract

Register a new proposal for community review. Registration is necessary but does not
guarantee a vote for its implementation. The proposal is stored in `allProposals`
which is an array of all submissions. A `Register` event is emitted.

Registering a proposal requires a deposit of 1000 ECO (`COST_REGISTER`), which is
transferred from the caller's balance to this contract. Approval of the transfer
must be done before calling `registerProposal`. If the proposal does not get voted
on then the caller will receive a refund of 800 ECO (`REFUND_IF_LOST`).

###### Security Notes
  - Requires payment to call, to prevent abuse.
  - You cannot propose the 0 address.
  - A proposal can only be registered once.

##### allProposalAddresses
Arguments: none

Returns the array `allProposals` that lists the addresses of all submitted proposals.

##### support
Arguments:
  - `_prop` (address) - the proposal to support

The `support` method allows currency holders to indicate their support for a
proposal. The caller's voting power (see `VotingPower` but is approximately
understood as their balance at the end of the last generation) is added to
the total supporting stake for the proposal. The support is not withdrawn from
the user's balance and is not locked up.

If this causes the proposal to reach the 30% threshold of total voting power
required for a vote, this function emits `SupportThresholdReached`, indicating that
`deployProposalVoting` is ready to be called. 

###### Security Notes
  - Can only be called during the staking period.
  - Can only be called by an account that held tokens at the last checkpoint.
  - Must be provided the address of a registered proposal.
  - Can only be called once for each proposal by any given account.
  - Cannot be called if a vote is triggered as the contract is no longer privileged.

##### unsupport
Arguments:
  - `_prop` (address) - the proposal to support

This function withdraws a user's support from a proposal if they have previously supported it. This cannot be called to bring a proposal that has passed the 30% threshold down below that threshold as it cannot be called if voting has been triggered.

###### Security Notes
  - Can only be called during the staking period.
  - Can only be called if support was previously given.
  - Must be provided the address of a registered proposal.
  - Cannot be called if a vote is triggered as the contract is no longer privileged.

##### deployProposalVoting
Arguments: none

Deploys the proposal voting contract. Caller pays the gas cost for deployment.
Will revert if called before a proposal reaches the support threshold.
It configures the `PolicyVotes` contract for the specific proposal, creates
a cloned copy of the contract for voting, removes the proposal to be voted on
from its own store (the submitter is not able to get a refund), emits a
`VoteStart` event, and finally removes the `PolicyProposals` contract
from having any policy permissions, ending the proposing process and making
room for the next one at the start of the next generation. 

###### Security Notes
  - Can only be called if a proposal has passed the support threshold but has
    not yet been moved to voting. 
  - Does not take any inputs, can only deploy the voting contract for the previously
    selected voting contract. 
  - Cannot be called more than once within the same cycle. 

##### refund
Arguments:
  - `_prop` (address) - the proposal to refund the fee for

Partially refunds (80%) the fee for the registration of a proposal that did not
make it to voting. Emits a `ProposalRefund` event.

###### Security Notes
  - Can only be called after the proposal time.
  - Always issues the refund to the original proposer. Regardless of who calls.
  - Can only be called once per proposal.
  - Cannot be called for the zero address.

##### destruct
Arguments: none

Self-destructs the contract, freeing all storage. Any ECO held is transferred to
the root policy contract.

###### Security Notes
  - Can only be called after all proposals have been refunded.
  - Can only be called after the proposal time, to disallow early exits.
  - Removes itself from the policy.

#### PolicyVotes
  - Inherits: `VotingPower`

 Basically, lets you vote.

##### Events
###### VoteCompleted
Attributes:
  - `result` (Result enum) - either `Accepted, Rejected, Failed`

Emitted when an outcome is known.

###### PolicyVoteCast
Attributes:
  - `voter` (address) - the address of the voter
  - `vote` (bool) - the vote cast, `true` to pass, `false` to fail
  - `amount` (uint256) - the voting power of the vote

Emitted when an address votes.

##### configure
Arguments:
  - `_proposal` (address) - the address of the proposal to vote on

Configures a policy vote, setting the policy to be voted on, the times that
the voting ends, and the generation to use for voting power calculation.

###### Security Notes
  - Is called atomically with instantiation.
  - Can only be called once, checks that the `voteEnds` time hasn't been set.

##### vote
Arguments:
  - `_vote` (bool) - the vote to submit, `true` to pass the proposal, `false` to fail

Records the caller's vote, weighted by their voting power. Records the voting power of
the caller in `totalStake` and in `yesStake` if the voter voted yes. Records yes votes
in the mapping `yesVote` which maps addresses to votes. Emits a `PolicyVoteCast` event.

###### Security Notes
  - Cannot be called if the voting period is over
  - Fails if the user has no voting power to vote with
  - May be called again, with a different value of `_vote` to change the vote


##### execute
Arguments: none

Runs the default function on the proposal, if it passed, and then removes the
permissions from the contract, transfers any tokens to the root policy, and
then self-destructs. Emits a `VoteCompleted` event.

###### Security Notes
  - Enacted proposals can do anything they like. They're run in the context of
    the root policy using `delegatecall`, allowing them to use `delegatecall` on
    behalf of any managed contract.
  - Can only be called before the voting period ends if the yes votes have already
    reached a majority.

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md).
