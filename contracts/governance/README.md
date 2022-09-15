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

The `CurrencyTimer` contract oversees the monetary governance processes: starting the vote process and enacting the results of the previous vote (except for [linear inflation](../currency/README.md#inflationcheckpoints)). When its `notifyGenerationIncrease` is called, it ensures that the winner is computed on the previous generation's `CurrencyGovernance` contract and then reads out the results of the winning proposal. It then clones the necessary contracts, all detailed in the [monetary governance README](./monetary/README.md#monetary-governance-system), and mints ECO when necessary for these contracts. Finally, it clones the next `CurrencyGovernance` contract, starting the next generation's process.

## Install
See the [main README](../../README.md) for installation instructions.

## Usage
Ideally an automation system tracks the governance system so as to keep the generation clock ticking. All the system knows is when the next generation update can be called and does not keep a memory of when the last generation started. Without an automation system tracking the progress of the governance system offchain, it is possible for the generation start times to drift by late calls to `increaseGeneration`.

## API

### TimedPolicies
  - Inherits: `Policed`, `TimeUtils`, `IGeneration`

The `TimedPolicies` contract manages the generation-based recurring processes that form the governance system. Existing processes that are activated by this inherit from the interface `IGenerationIncrease` to have the function  `notifyGenerationIncrease` which is called by this contract each time it starts a new generation. The community voting contract is directly cloned from this contract.

#### Process Overview
This contract holds and maintains an array `notificationHashes` which contains the ERC1820 keys for the different `IGenerationIncrease` contracts. This is set on construction and onyl includes the `ECO` and `CurrencyTimer` at launch. When the generation increase is triggered, this contract looks up the addresses for each of these contracts and calls their implementation of `notifyGenerationIncrease`.

#### Events
##### PolicyDecisionStart
Attributes:
  - `contractAddress` (address) - the address of the `PolicyProposals` contract
    supervising the vote

Indicates the start of a policy vote.

##### NewGeneration
Attributes:
  - `generation` (uint256) - the generation being started

Emitted at the end of a generation increment process. The value of `generation` is initialized at `1000`. This is marked by the constant `GENERATION_START`.

#### incrementGeneration
Arguments: none

Increments the `generation` variable and sets the time at which the new generation will end. It calculates the amount of ECO that will be minted during the process. Then it goes through the list of `notificationHashes` and calls `notifyGenerationIncrease` on each of them. Finally calls `startPolicyProposal`.

##### Security Notes
  - This method can only be invoked at most once every 14 days, marked by the constant `MIN_GENERATION_DURATION`.
  - It can be invoked by anyone who wishes to begin a the next generation and will likely be maintained by off-chain automation.

#### startPolicyProposal
Arguments:
  - `_mintedOnGenerationIncrease` (uint256) - the amount of ECO minted during the generation increment to be ignored by the community voting contracts.

Begins a new policy voting process. A new instance of the `PolicyProposals` contract is created, configured, and granted appropriate permissions. The address of the new contract can be found by querying the root policy address for the `PolicyProposals` policy provider (see [here](../policy/README.md#policyfor) for more info).

A `PolicyDecisionStart` event is emitted with the `PolicyProposals` contract address to indicate the start of a new vote.

##### Security Notes
  - This function is internal.

### CurrencyTimer
  - Inherits: `PolicedUtils`, `IGenerationIncrease`, `ILockups`

The `CurrencyTimer` contract is delegated the responsibility of implementing the decisions decided on by the trustees in their Currency Governance votes
(detailed more below). It holds the on-chain address of clone template for the `CurrencyGoverance`, `RandomInflation`, and `Lockup` contracts as the public variables `bordaImpl`, `inflationImpl`, and `lockupImpl`, respectively. It also tracks all clones for `Lockup` and `RandomInflation` in the public mappings `lockups` and `randomInflations` respectively, keyed by the generation number where the policy decision for them originated. Finally, it is called by `Lockup` contracts to payout interest or enact penalties for withdrawals.

#### Events

##### NewCurrencyGovernance
Attributes:
  - `addr` (address) - the address of the new CurrencyGovernance contract.
  - `generation` (uint256) - the generation where currency governance will happen.

Indicates the location of the new CurrencyGovernance contract.

##### NewInflation
Attributes:
  - `addr` (address) - the address of the `RandomInflation` contract facilitating
    the distribution of random inflation.
  - `generation` (uint256) - the generation in which the new inflation was agreed upon

Indicates the start of a random inflation decision.

##### NewLockup
Attributes:
  - `addr` (address) - the address of the `Lockup` contract being offered
  - `generation` (uint256) - the generation in which the new lockup was agreed upon

Indicates the start of a lockup offering.

#### notifyGenerationIncrease
Arguments: none

When notified of a generation increase, this contract will find the existing clone of `CurrencyGovernance` to read the results of the most recent vote. If that vote calls for the creation of any new lockups or random inflation contracts, those are cloned. New lockups are added to the mapping `lockups` and new randomInflation is added to the mapping `randomInflations` which map the generation they were offered to the address. Finally the new `CurrencyGovernance` contract is cloned. Events are emitted to represent the actions taken.

##### Security Notes
 - This method cannot be called until the `TimedPolicies` generation has changed from the one stored in this contract. That action is done atomically with a call to this function. However, this may still be called if one of the calls from `TimedPolicies` reverts so that there is still a chance that the system might survive.

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md).
