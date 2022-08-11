# Community Governance System
> Community governance policies for the Eco currency.

These contracts provide the community governance system for the eco currency. They specifically address voting open to all token holders for code upgrades to the contract system. Upgrades are managed in terms of proposals, some templates of which are included as .propo.sol files, which are voted on and may be executed across the span of a generation.

## Table of Contents
  - [Security](#security)
  - [Background](#background)
  - [Install](#install)
  - [Usage](#usage)
  - [API](#api)
  - [Contributing](#contributing)
  - [License](#license)

## Security
The security of community governance is built off of the network effect of requiring a significant percentage of token holder consensus at each step of the way. The security of balances to enforce this consensus is maintained by the checkpointing system detailed in the currency readme [here](../../currency/README.md#votecheckpoints).

## Background
The process of the Community Governance vote is set to the global Generation Cycle of 14 days. During the first phase (up to 9 days and 16 hours), Proposals can be submitted and users may perform a signal vote for each one. If any proposal succeeds the signal vote threshold, the initial phase ends and a voting phase immediately starts (lasting 3 days). After the voting phase is finished, there is a delay period of 1 day before enaction (if the proposal passed). This all completes once within the course of a generation and is restarted when the generation increments.

## Install
See the [main README](../../README.md) for installation instructions.

## Usage
The `PolicyProposals` and `PolicyVotes` contracts handle the vote process. `PolicyProposals` is cloned each generation by the [TimedPolicies](../README.md#timedpolicies) contract and clones the `PolicyVotes` contract when the process moves to a vote. Voting ability calculation is implemented in the `VotingPower` contract. Ability to vote with ECOx is managed by the `ECOxStaking` contract. Sample proposals all follow the format of the `Proposal` contract and will not be discussed individually.

## API

### VotingPower
  - Inherits: `PolicedUtils`

This contract is for `PolicyProposals` and `PolicyVotes` to inherit the functionality for computing voting power for any address. The voting power calculation combines the amount of ECO in the last checkpoint before the voting process starts with the same checkpoint for qualified amounts of ECOx. There is no preferential weighting, one wei of ECO = one wei of ECOx = one vote. See the [currency](../../currency/README.md#votecheckpoints) documentation for more explanation about the checkpointing system and see [ECOxStaking](./README.md#ecoxstaking) in this readme to see what qualifies ECOx for voting.

#### votingPower
Arguments:
  - `_who` (address) - the address's voting power to compute
  - `_blockNumber` (uint256) - the block number at which to compute the voting power.

Queries `ECO` for the addresses's voting total at `_blockNumber` and similarly for `ECOxStaking`. Adds them both and returns.

##### Security Notes
  - Will revert on each lower level call if `_blockNumber` is in the future.

#### totalVotingPower
Arguments:
  - `_blockNumber` (uint256) - the generation at which to compute.

Computes the voting power using the total supply at `_blockNumber` for `ECO` and `ECOxStaking`.

##### Security Notes
  - Will revert on each lower level call if `_blockNumber` is in the future.

### PolicyProposals
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

#### Events
##### Register
Attributes:
  - `proposer` (address) - the address submitting the proposal
  - `proposalAddress` (address) - the address of the submitted proposal

Emitted on successful submission of a new proposal.

##### Support
Attributes:
  - `supporter` (address) - the address that supported the proposal
  - `proposalAddress` (address) - the address of the proposal being supported

Emitted when `support` is successfully called. Helps external systems keep tabs
on the supporting process.

##### Unsupport
Attributes:
  - `unsupporter` (address) - the address that supported the proposal
  - `proposalAddress` (address) - the address of the proposal being supported

Emitted when `unsupport` is successfully called. Helps external systems keep tabs
on the supporting process.

#### SupportThresholdReached
Attributes:
  - `proposalAddress` (address) - the address of the proposal that reached the threshold

Emitted when a proposal crosses the support threshold and is ready to be voted on.
Indicates that deployProposalVoting can and should now be called.

##### VoteStart
Attributes:
  - `contractAddress` (address) - the address of the `PolicyVotes` contract, overseeing the vote.

Emitted once a proposal has reached sufficient support and voting has been started.

##### ProposalRefund
Attributes:
  - `proposer` (address) - the address of the proposal's initial submitter

Emitted when an unsuccessful proposer recoups a part of their fee.

#### registerProposal
Arguments:
  - `_prop` (address) - the address of the proposal contract

Register a new proposal for community review. Registration is necessary but does not
guarantee a vote for its implementation. The proposal is stored in `allProposals`
which is an array of all submissions. A `Register` event is emitted.

Registering a proposal requires a deposit of 1000 ECO (`COST_REGISTER`), which is
transferred from the caller's balance to this contract. Approval of the transfer
must be done before calling `registerProposal`. If the proposal does not get voted
on then the caller will receive a refund of 800 ECO (`REFUND_IF_LOST`).

##### Security Notes
  - Requires payment to call, to prevent abuse.
  - You cannot propose the 0 address.
  - A proposal can only be registered once.

#### allProposalAddresses
Arguments: none

Returns the array `allProposals` that lists the addresses of all submitted proposals.

#### support
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

##### Security Notes
  - Can only be called during the staking period.
  - Can only be called by an account that held tokens at the last checkpoint.
  - Must be provided the address of a registered proposal.
  - Can only be called once for each proposal by any given account.
  - Cannot be called if a vote is triggered as the contract is no longer privileged.

#### unsupport
Arguments:
  - `_prop` (address) - the proposal to support

This function withdraws a user's support from a proposal if they have previously supported it. This cannot be called to bring a proposal that has passed the 30% threshold down below that threshold as it cannot be called if voting has been triggered.

##### Security Notes
  - Can only be called during the staking period.
  - Can only be called if support was previously given.
  - Must be provided the address of a registered proposal.
  - Cannot be called if a vote is triggered as the contract is no longer privileged.

#### deployProposalVoting
Arguments: none

Deploys the proposal voting contract. Caller pays the gas cost for deployment.
Will revert if called before a proposal reaches the support threshold.
It configures the `PolicyVotes` contract for the specific proposal, creates
a cloned copy of the contract for voting, removes the proposal to be voted on
from its own store (the submitter is not able to get a refund), emits a
`VoteStart` event, and finally removes the `PolicyProposals` contract
from having any policy permissions, ending the proposing process and making
room for the next one at the start of the next generation. 

##### Security Notes
  - Can only be called if a proposal has passed the support threshold but has
    not yet been moved to voting. 
  - Does not take any inputs, can only deploy the voting contract for the previously
    selected voting contract. 
  - Cannot be called more than once within the same cycle. 

#### refund
Arguments:
  - `_prop` (address) - the proposal to refund the fee for

Partially refunds (80%) the fee for the registration of a proposal that did not
make it to voting. Emits a `ProposalRefund` event.

##### Security Notes
  - Can only be called after the proposal time.
  - Always issues the refund to the original proposer. Regardless of who calls.
  - Can only be called once per proposal.
  - Cannot be called for the zero address.

#### destruct
Arguments: none

Self-destructs the contract, freeing all storage. Any ECO held is transferred to
the root policy contract.

##### Security Notes
  - Can only be called after all proposals have been refunded.
  - Can only be called after the proposal time, to disallow early exits.
  - Removes itself from the policy.

### PolicyVotes
  - Inherits: `VotingPower`

 Basically, lets you vote.

#### Events
##### VoteCompletion
Attributes:
  - `result` (Result enum) - either `Accepted, Rejected, Failed`

Emitted when an outcome is known.

##### PolicyVote
Attributes:
  - `voter` (address) - the address of the voter
  - `vote` (bool) - the vote cast, `true` to pass, `false` to fail
  - `amount` (uint256) - the voting power of the vote

Emitted when an address votes.

#### configure
Arguments:
  - `_proposal` (address) - the address of the proposal to vote on

Configures a policy vote, setting the policy to be voted on, the times that
the voting ends, and the generation to use for voting power calculation.

##### Security Notes
  - Is called atomically with instantiation.
  - Can only be called once, checks that the `voteEnds` time hasn't been set.

#### vote
Arguments:
  - `_vote` (bool) - the vote to submit, `true` to pass the proposal, `false` to fail

Records the caller's vote, weighted by their voting power. Records the voting power of
the caller in `totalStake` and in `yesStake` if the voter voted yes. Records yes votes
in the mapping `yesVote` which maps addresses to votes. Emits a `PolicyVote` event.

##### Security Notes
  - Cannot be called if the voting period is over
  - Fails if the user has no voting power to vote with
  - May be called again, with a different value of `_vote` to change the vote


#### execute
Arguments: none

Runs the default function on the proposal, if it passed, and then removes the
permissions from the contract, transfers any tokens to the root policy, and
then self-destructs. Emits a `VoteCompletion` event.

##### Security Notes
  - Enacted proposals can do anything they like. They're run in the context of
    the root policy using `delegatecall`, allowing them to use `delegatecall` on
    behalf of any managed contract.
  - Can only be called before the voting period ends if the yes votes have already
    reached a majority.

### ECOxStaking
  - Inherits: `ERC20Votes`, `PolicedUtils`

Contains the logic for depositing and withdrawing EcoX to/from lockup. The quantity of
EcoX locked up relative to the total supply (both at a given block number) determine
an individual's voting power. This contract also maintains a mapping of addresses -->
the last generation in which that address cast a vote - this is used to determine
whether or not an address is permitted to withdraw (withdrawal is not permitted until
two generations after the last vote was cast by the withdrawing address).

#### Events

##### Deposit
Attributes: 
  - `source` (address) - The address that a deposit certificate has been issued to
  - `amount` (uint256) - The amount of ECOx tokens deposited

The Deposit event indicates that ECOx has been locked up, credited to a particular
address in a particular amount.

##### Withdrawal
Attributes:
  - `destination` (address) The address that has made a withdrawal
  - `amount` (uint256) The amount in basic unit of 10^{-18} ECOx (weicoX) tokens withdrawn

The Withdrawal event indicates that a withdrawal has been made to a particular address
in a particular amount

#### deposit
Arguments:
  - `_amount` (uint256) - amount of EcoX sender is attempting to deposit

Transfers EcoX in the amount `_amount` from msg.sender to the EcoXLockup contract.
A checkpoint is written to increase totalSupply and the voting balance of msg.sender by
`_amount` for the current block number. This also results in a Deposit event being emitted.

##### Security Notes
  - only updates totalSupply and voting power balance if the transfer is successful i.e. if
    msg.sender has at least `_amount` of EcoX in their balance

#### withdraw
Arguments:
  - `_amount` (uint256) - amount of EcoX sender is attempting to withdraw

Transfers EcoX in the amount `_amount` to msg.sender. Ensures that
A checkpoint is written to decrease totalSupply and the voting balance of msg.sender by
`_amount` for the current block number. This also results in a Withdrawal event being emitted.

### votingECOx
Arguments:
  - `_voter` (address) - address whose voting power is being assessed
  - `_blocknumber` (uint256) - block number at which voting power is being assessed

Fetches the EcoX voting power of a given address at a given block. This is accomplished by
binary searching to find the earliest checkpoint taken after the given block number, and
then getting the balance of the address in that checkpoint.

### totalVotingECOx
Arguments:
  - `_blocknumber` (uint256) - block number at which voting power is being assessed

Fetches the total voting power at a given block. This is accomplished by binary searching to
find the earliest checkpoint taken after the given block number, and then getting the sum of
all balances at that checkpoint.

##### Security Notes
  - can only be invoked by the policy proposals contract or the policy votes contract

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md).
