# The Eco Currency
> Contracts implementing the Eco currency.

This implements the ECO Cryptocurrency, and its partner token ECOx, in the form of smart contracts on the
Ethereum VM. Contracts are written in Solidity, tests are in JavaScript.

## Table of Contents
 - [Security](#security)
 - [Background](#background)
 - [Install](#install)
 - [Usage](#usage)
 - [API](#api)
 - [Contributing](#contributing)
 - [License](#license)

## Security
The Eco currency implementation is designed to be managed by the
[Currency Governance System](../governance). Other deployments have
not been considered.

## Background
The ECO currency is designed to support multiple concurrent token interfaces by
isolating the account balance store from the token interfaces. Additionally, this
`GenerationStore` for balances is separated from the currency mechanics so as to
be used as a parent contract for both currencies. Users cannot interact
directly with the `GenerationStore` and instead will use various privileged
token interfaces to do so.

The `GenerationStore` contract implements a generational balance store for all
token interfaces that Eco might support. It is upgradable using the policy
framework laid out in the governance community voting (see [here](../governance/README.md)), and is used solely
for tracking user balances, total supply, and inflation over generations.

The ECO token supports linear inflation (increasing all balances by a multiplier)
and the effects of this operation is managed by the `EcoBalanceStore` contract.
The `GenerationStore` store contract stores balances in "uninflated" units that
are not affected by inflation actions as well as the `historicLinearInflation`
which tracks the multiplier between these uninflated units and units of ECO.
The `EcoBalanceStore` inherits from `GenerationStore` and provides all the
standard token functions for transferring, minting, and burning. It converts
inputs of these functions by the inflation multiplier so as to keep the balance
records in terms of uninflated units.

The ECOx token comes with its own custom interface that's an extension of ERC20
accompanied by the same kind of generational balance store used for ECO. It adds
the functionality to convert ECOx into an amount of ECO of equal percentage
of total supply as the ECOx burned (explained in detail in the API). ECOx
does not have inflation in its design and uses the default inflation scale
factor of 1.

Token interfaces are authorized using the policy framework, and once authorized
can perform balance transfer and token burn actions on the balance store.

### The Generational Store
The `GenerationStore` uses a multi-generational database architecture. Periodic
checkpoints are created for every account, with the set of balances at the
last checkpoint being known as the "previous generation". Balances for past
generations are immutable - only the present generation ever changes.

Generation checkpoints are every 14 days. The store maintains up to 3 previous
balance checkpoints per balance, though not necessarily the past 3 generations
if the user balance does not change often.

Every time a transfer is made, account balances are first checked for
checkpointing. If the balance has not been updated this generation, the
pre-transfer balance is written in the generational store to fill the 
generations between when it was last updated. Old checkpoints (more than 3
generations ago) for the account are cleaned up during the new checkpoint
creation to reduce storage requirements. Checkpoints can also be explicitly
created using the `updateTo` method.

Checkpoints are used to allow stake-weighted voting without requiring funds
lockup. By using the previous generation checkpoint as the weight of any stake
weighted vote it becomes impossible to count the same staked tokens twice.

### References

 - [ERC20](https://theethereum.wiki/w/index.php/ERC20_Token_Standard)
 - [ERC1820](https://eips.ethereum.org/EIPS/eip-1820)

## Install
See the [main README](../../README.md) for installation instructions.

## Usage
The currency contracts are intended for deployment on the Ethereum blockchain,
using Eco's [Governance System](../governance) (built on the
[policy framework](../policy)). The currency additionally provides an ERC20
interface, which is how most systems will interact with it. The
governance system can be used to add new interfaces in the future.

## API
### GenerationStore
 - Inherits: `PolicedUtils`, `ITimeNotifier`

The `GenerationStore` contract forms the basis of storing balances for both the
ECO and ECOx cyptocurrencies. It hodls a mapping for user balances over multiple
generations and the procedure for updating them. It also stores the total supply
and the inflation multiplier for each generation.

#### Events
No events

#### balanceAt
Arguments:
 - `_owner` (address) - the address of the balance to check
 - `_pastGeneration` (uint256) - the generation to check at (can be `currentGeneration`)

Returns the balance, scaled by inflation, at the specified generation. If the
user's balance has not been updated since before that generation, then the newest
balance is returned (still scaled by the inflation for the correct generation
requested), but the balance stores are not updated to avoid unexpected
computational cost. Will return zero if there is not data to correctly compute
the balance at the generation.

#### balance
Arguments:
 - `_owner` (address) - the address of the balance to check

Returns the results of balanceAt(_owner, `currentGeneration`)

#### tokenSupply
Arguments: none

Returns the current token supply, scaled by inflation.

#### totalSupplyAt
Arguments:
 - `_generation` (uint256) - the generation to check at (can be `currentGeneration`)

Returns the token supply at the specified generation, scaled by the inflation
factor at that generation.

#### setTokenSupply
Arguments:
 - `_amount` (uint256) - the inflated currency amount to set the token supply to

Scales the _amount by the current inflation scaling and setting the token
supply for the current generation to that amount.

##### Security Notes
 - This is an internal function. It is used so that inheretors of this contract
   can access the token supply without having to do their own calculations of
   inflation.

#### isUpdated
Arguments:
 - `_owner` (address) - the address of the balance to check if updated

Returns true if the balance of the address has an entry for the current
generation, otherwise false.

#### update
Arguments:
 - `_owner` (address) - the address of the balance to update

Makes sure that the address's balance has exactly the last 3 generations stored
in the balances mapping. If the last recorded balance was many generations ago,
then it is just copied into those 3 slots. If the generation was within the
last 3, whatever unfilled slots are filled. Then the old values are zeroed for
storage concerns. Finally the current generation is stored as the last
generation the address's balance was updated.

##### Security Notes
Any person can call this function on any address. It is called by transfer
methods and the end result represents the ideal data configuration at any
point in time. Effects are idempotent for any specific generation.

#### notifyGenerationIncrease
Arguments: none

See the `TimedPolicies` contract [here](../governance).

This is part of the generation increase machinery. The `currentGeneration` is
increased and the total supply and linear inflation constants are pushed
forward. In the case of a governance decision, this value of the linear
inflation constant will be overwritten via another process.

##### Security Notes
Can only be called if the `TimedPolicies` contract has increased its generation
compared to the `currentGeneration` stored here.

### EcoBalanceStore
 - Inherits: `GenerationStore`

This is the main generation store contract for the ECO token specifically. The
function of this contract is mostly to manage the translation between token
interface contract functionality (which works in inflated units) and the
generation store functionality (which works in uninflated units). It also
manages which token interfaces are approved to communicate with it. Therefore
it trusts all transfer approvals managed by those approved contracts.

#### Events

##### Authorized
Attributes:
 - `source` (address) - the policy that called for this authorization
 - `contractIdentifier` (string) - the ERC1820 identifier of the newly authorized contract

This denotes that a new token interface has been authorized to use this contract.

##### Revoked
Attributes:
 - `source` (address) - the policy that called for this authorization
 - `contractIdentifier` (string) - the ERC1820 identifier of the newly authorized contract

This denotes that a token interface has had its authorization to use this contract revoked.

##### Minted
Attributes:
 - `source` (address) - the policy that called for the minting
 - `to` (address) - the recipient of the minting action
 - `value` (uint256) - the amount minted (in units of 10^-18 of one, inflated ECO)

This marks an event when new tokens are minted.

##### Burned
Attributes:
 - `source` (address) - the policy that was called for the burning
 - `from` (address) - the source of the burned tokens
 - `value` (uint256) - the amount burned (in units of 10^-18 of one, inflated ECO)

This marks an event when tokens are burned.

##### InflationRootHashProposalStarted
 - `inflationRootHashProposalContract` (address) - the address of the newly created
      `InflationRootHashProposal` contract.
 - `generation` (uint256) - the generation in which the decision to add random
      inflation would be made. This is generally the generation before the call
      to `notifyGenerationIncrease` is made.

This marks one of the generation increase actions where the
`InflationRootHashProposal` contract is set up and its address is stored in a
mapping, keyed by the generation that just ended (same as in the event). See
the `InflationRootHashProposal` docs [here](../governance/README.md) for more
details.

#### authorize
Arguments:
 - `_policyIdentifier` (string) - the ERC1820 identifier for the policy to be authorized

This function adds the specified policy as authorized to take transfer and burn
actions. This is used for authorizing token interfaces to work with the balance
store. This emits an `Authorized` event and uses `reAuthorize` to make sure the
contracts are up to date.

##### Security Notes
This has the `onlyPolicy` modifier which restricts method access to only the
root policy instance. See Policy documentation [here](../policy/README.md).

#### revoke
Arguments:
 - `_policyIdentifier` (string) - the ERC1820 identifier for the policy to be revoked

This function removes the specified policy from the list of authorized contracts
to take transfer and burn actions. This is used for removing token interfaces.
This emits a `Revoked` event and uses `reAuthorize` to make sure the remaining
contracts are up to date.

##### Security Notes
This has the `onlyPolicy` modifier which restricts method access to only the
root policy instance. See Policy documentation [here](../policy/README.md).

#### isAuthorized
Arguments:
 - `_contract` (address) - the address of the contract to be checked

Checks to see if the contract address is authorized to work with the balance
store.

#### tokenTransfer
Arguments:
 - `_operator` (address) - the address that called for the transfer
 - `_from` (address) - the address who is the source balance of the transfer
 - `_to` (address) - the address who is the recipient balance of the transfer
 - `_value` (uint256) - the amount minted (in units of 10^-18 of one, inflated ECO)

Uses `update` (above) to make sure both balances are current, then transfers
the tokens, recording it in the generational balance store. Then passes the data
back to the token interface for it to emit a transfer event.

##### Security Notes
Can only be called by an interface contract that has been previously Authorized.

#### tokenBurn
Arguments:
 - `_operator` (address) - the address that called for the transfer
 - `_from` (address) - the address who is the source balance of the transfer
 - `_value` (uint256) - the amount minted (in units of 10^-18 of one, inflated ECO)

Uses `update` (above) to make sure the source balance is current, then burns
the tokens, recording the balance in the generational balance store. Then passes
the data back to the token interface for it to emit a burned event.

##### Security Notes
Can only be called by an interface contract that has been previously Authorized.

#### mint
Arguments:
 - `_operator` (address) - the address that called for the transfer
 - `_to` (address) - the address who is the recipient balance of the transfer
 - `_value` (uint256) - the amount minted (in units of 10^-18 of one, inflated ECO)

Uses `update` (above) to make sure the balance is current, then adds the tokens
to the specified address recording it in the generational balance store. Then
passes the data back to the token interface for it to emit a transfer event.

##### Security Notes
Can only be called by for `CurrencyGoverance`, `CurrencyTimer`, `ECOx`, and
`Faucet` contracts. See the [governance](../governance) and [deployment](../deploy)
code and the documentation of ECOx below for more details.

#### destruct
Arguments: none

Calls `selfdestruct` for the contract.

##### Security Notes
Can only be called by a `ContractCleanup` contract. See [Policy](../policy) for
more details.

#### name
Arguments: none

Returns 'Eco'

#### symbol
Arguments: none

Returns 'ECO'

#### decimals
Arguments: none

Returns 18

#### reAuthorize
Arguments: none

Enumerates the list of ERC1820 policy identifiers in `authorizedContracts` and
re-generates the list of addresses for them. Then it calls the function from
`TokenPrototype` to make sure those contracts have the right address for this
store.

##### Security Notes
This update puts all affected contracts to an ideal state of knowing what addresses
the others contracts have. The action is idempotent so long as nothing else has
changed and would require a malicious actor to be able to replace addresses in the 
ERC1820 store to impersonate any of the contracts involved.

#### notifyGenerationIncrease
Arguments: none

First calls the "super" action for this function (inherited from `GenerationStore`).

Then it checks the results of the most recent `CurrencyGovernance` vote (see 
[here](../governance/README.md) for more details) to see if any additional linear
inflation was added. If there was a vote to scale by an additional factor, it
changes the value of the linear inflation for the new generation.

Then a new `InflationRootHashProposal` (see [here](../governance/README.md)) is
cloned and its address is stored in the mapping `rootHashAddressPerGeneration`
that serves as a lookup.

### ECOx
 - Inherits: `GenerationStore`

This is basically just an [ERC20](https://theethereum.wiki/w/index.php/ERC20_Token_Standard)
implementation with a few additional functions. Those functions will be documented
below. All data storage is inherited from `GenerationStore`, but the ECOx token
has an inflation scale of 1 so that part is simplified.

#### exchange
Arguments:
 - `_ecoXValue` (uint256) - the amount of ECOx for the calling address to exchange

This function burns the specified amount of ECOx and gives the user ECO in
return. The percentage that the burned ECOx was of the total initial supply of ECOx
is equal to the ECO given as a percentage of the current total supply of ECO, but 
continuously compounded along the process. This creates an exponential function relation
between the two ratios. See [our whitepaper](???) for more discussion.

#### valueAt
Arguments:
 - `_ecoXValue` (uint256) - the value of ECOx to be appraised
 - `_gen` (uint256) - the generation to calculate at

Returns the value of ECO that the ECOx would be worth at the specified generation,
if it had been exchanged.

#### ecoValueOf
Arguments:
 - `_ecoXValue` (uint256) - the value of ECOx to be appraised

Returns the value of ECO that the ECOx would be worth at the current generation,
if it was to be exchanged.

### TokenPrototype
 - Inherits: `PolicedUtils`, `TokenEvents`

This is a contract that acts as a parent contract for any interface created to
interaction with `EcoBalanceStore` and makes sure that there is all the necessary
information and machinery under the hood to split the interface from the data
store. This mostly consists of a method for the balance store to call to make
sure its address is up to date as well as functions (detailed in `TokenEvents`)
for the balance store to call to pass event data back upstream.

#### updateStore
Arguments: none

Looks to the ERC1820 registry to set the address for the `EcoBalanceStore`.
Is called by the `EcoBalanceStore` in its normal use to make sure that any
mismatch is fixed.

##### Security Notes
As with most of our public "update" functions, this only causes issues if,
somehow, the ERC1820 store is compromised in some way. Otherwise it just
updates data to reflect the state of the system.

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md). Note that some files in this directory
are under different licenses. See file headers for details where applicable.
