# Governance System
> Governance policies for the Eco currency.

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

### Community Decisions
The Community Decisions process provides a mechanism for upgrading contracts or
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
the 72 hour voting phase, the proposal passes if it has more yes votes than no
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
###### PolicyDecisionStart
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

A `PolicyDecisionStart` event is emitted with the `PolicyProposals` contract
address to indicate the start of a new vote.

###### Security Notes
This function is internal.

#### CurrencyTimer
  - Inherits: `PolicedUtils`, `IGenerationIncrease`, `ILockups`

The `CurrencyTimer` contract is delegated the responsibility of implementing
the decisions decided on by the trustees in their Currency Governance votes
(detailed more below). It holds the on-chain address of clone template for the
`CurrencyGoverance`, `RandomInflation`, and `Lockup` contracts as the public variables
`bordaImpl`, `inflationImpl`, and `lockupImpl`, respectively.

##### Events

###### NewCurrencyGovernance
Attributes:
  - `addr` (address) - the address of the new CurrencyGovernance contract.
  - `generation` (uint256) - the generation where currency governance will happen.

Indicates the location of the new CurrencyGovernance contract.

###### NewInflation
Attributes:
  - `addr` (address) - the address of the `RandomInflation` contract facilitating
    the distribution of random inflation.
  - `generation` (uint256) - the generation in which the new inflation was agreed upon

Indicates the start of a random inflation decision.

###### NewLockup
Attributes:
  - `addr` (address) - the address of the `Lockup` contract being offered
  - `generation` (uint256) - the generation in which the new lockup was agreed upon

Indicates the start of a lockup offering.

##### notifyGenerationIncrease
Arguments: none

When notified of a generation increase, this contract will find the existing clone of `CurrencyGovernance` to read the results of the most recent vote. If that vote calls for the creation of any new lockups or random inflation contracts, those are cloned. New lockups are added to the mapping `lockups` and new randomInflation is added to the mapping `randomInflations` which map the generation they were offered to the address. The old lockups offered during the previous generation are funded to be able to pay out interest, as they are now closed for contributions. Finally the new `CurrencyGovernance` contract is cloned. Events are emitted to represent the actions taken.

###### Security Notes
 - This method cannot be called until the `TimedPolicies` generation has changed from the one stored in this contract.

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md).
