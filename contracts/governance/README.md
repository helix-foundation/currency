# Governance System
> Governance policies for the Eco currency.

The governance system of the ECO and ECOx currencies is designed to maintain and upgrade both the currencies and itself. The subfolders have their own READMEs outlining both [community](./community/README.md) and [monetary](./monetary/README.md) governance. This document describes the automation and storage machinery used to manage these processes and the generation update system.

## Table of Contents
  - [Security](#security)
  - [Background](#background)
  - [Install](#install)
  - [Usage](#usage)
  - [API](#api)
  - [Contributing](#contributing)
  - [License](#license)

## Security
The contracts here only expose public functions that push the process of the currency forward and are only callable when that forward progress is desired. They take no inputs and are designed to be agnostic to the person who uses them. The idea is that the system doesn't mind who increases the generation clock, just that someone does.

## Background
The `TimedPolicies` contract oversees the generation clock and the community governance. It maintains a list of ERC1820 labels to notify of the generation increase and calls `notifyGenerationIncrease` on each of these contracts. At launch, this only calls to the `ECO` and the `CurrencyTimer` contract. It also clones and configures the `PolicyProposals` contract, kicking off the community governance process.


## Install
See the [main README](../../README.md) for installation instructions.

## Usage
Ideally an automation system tracks the governance system so as to keep the generation clock ticking. All the system knows is when the next generation update can be called and does not keep a memory of when the last generation started. Without an automation system tracking the progress of the governance system offchain, it is possible for the generation start times to drift by late calls to `increaseGeneration`.

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
