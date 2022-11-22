# The Eco Currency
> Contracts implementing the Eco currency.

This implements the ECO cryptocurrency, and its secondary token ECOx, in the form of smart contracts on the Ethereum VM.

## Table of Contents
 - [Security](#security)
 - [Background](#background)
 - [Install](#install)
 - [Usage](#usage)
 - [API](#api)
 - [Contributing](#contributing)
 - [License](#license)

## Security
The Eco currency implementation is designed to be managed by the [Governance System](../governance). Other deployments have not been considered.

## Background
The ECO and ECOx ERC20 tokens are managed by the `ECO` and `ECOx` contracts respectively, inhereting that functionality from a slightly modified copy of `ERC20.sol` in this repository. ECO has significant extra functionality added on top of this standard that is tied to Eco's governance system. ECOx is closer to a base ERC20 and should be easily compliant in external systems.

The first main function of ECO is a vote checkpointing system that operates off of post-transfer hooks. The checkpoint system is used to snapshot voting in Eco's governance system (see the `VotingPower` contract [here](../governance/community/README.md#votingpower)). This allows for methods to lookup up the user's balance at the time (block number) when the vote in question starts and "snapshots" voting power.

The ECO token supports linear inflation (increasing or decreasing all balances by a multiplier) and the effects of this operation is detailed in the `InflationCheckpoints` contract, a parent of `ECO`. The balances are stored in "uninflated" units that are not affected by inflation actions. The balances are then returned as the uninflated balance divided by the inflation factor. The inflation multiplier is stored in its own set of checkpoints to facilitate historical balance lookups. This is similar to rebase functions of other currencies, except it is infrequent, and triggered by the decisions of governance (see [Monetary Governance](../governance/monetary/README.md) for more information).

ECO can also be delegated. This allows the owner's balance to be tracked in the checkpoints for the delegates. Note, this doesn't change the balance of the user, only its voting power. Delegate functionality is detailed in the `VoteCheckpoints` contract, which is a parent of `InflationCheckpoints` and therefore `ECO`. Each address is, by default, not delegated.

The ECOx token adds the functionality to convert ECOx into ECO. The amount of ECO received is based on the percentage of total supply of the ECOx burned (explained in detail in the API). ECOx does not have inflation in its design and its voting is handled by a [staking contract](../governance/community/README.md#ecoxstaking) instead of by checkpoints.

Finally, both tokens can be "paused" by an elected address, governed by Eco's governance system. During a pause, all transfers are rejected.

### References

 - [ERC20](https://theethereum.wiki/w/index.php/ERC20_Token_Standard)
 - [ERC2612](https://eips.ethereum.org/EIPS/eip-2612)
 - [ERC712](https://eips.ethereum.org/EIPS/eip-712)
 - [ERC1820](https://eips.ethereum.org/EIPS/eip-1820)

## Install
See the [main README](../../README.md) for installation instructions.

## Usage
The currency contracts are intended for deployment on the Ethereum blockchain, using Eco's [Governance System](../governance) (built on the [policy framework](../policy)). Each currency contract is built to handle the balances and peer to peer actions of token holding addresses.

## API

### ERC20
 - Inherits: `ERC20Permit`

Other than the `permit` functionality that will be detailed in its associated contract, Eco's implementation of ERC20 differs from the baseline in a few ways. One is that transfers to the zero address are disallowed and the `burn` function must be used instead. The `approve` function disallows approvals to the zero address to make it clear that this is the case. Another difference is that `transferFrom` emits an `Approval` event to denote the fact that the approval amount is changed by its action. Towards clarity and for safety in other use, functions for `decreaseAllowance` and `increaseAllowance` are added. When it comes to return values, functions will revert instead of returning `false`, but will still return `true` on success to remain compatible for integrations that check for success. Finally, the `name` and `symbol` variables are stored as immutable bytes32 and converted to strings by the getter functions.

### ERC20Pausable
 - Inherits: `ERC20`, `Pausable`

Using the openzeppelin library for tracking the pause, this contract sets up a `pauser` and a `roleAdmin` to be in charge of the circuit breaker. The `pauser` is the address that is able to pause the system (stopping transfers) and the `roleAdmin` is the address which can change the `pauser`. In Eco's system, the root policy contract is the `roleAdmin` as this allows the `pauser` to be changed by [Community Governance](../governance/community/README.md).

#### Events

##### PauserAssignment
Attributes:
 - `pauser` (address) - the new address assigned to be a pauser

Emitted when `setPauser` is called.

##### Paused
Attributes:
 - `account` (address) - the address of the pauser who enacted the pause.

Emitted when `pause` is called.

##### Unpaused
Attributes:
 - `account` (address) - the address of the pauser who enacted the unpause.

Emitted when `unpause` is called.

#### pause
Arguments: none

Pauses the system. Sets the variable `_paused` (accessable via `paused()`) to true. This causes the `_beforeTokenTransfer` hook to revert.

##### Security Notes
 - only callable by the `pauser`
 - reverts if already paused

#### unpause
Arguments: none

Unpauses the system. Sets the variable `_paused` (accessable via `paused()`) to false. System goes back to working as usual.

##### Security Notes
 - only callable by the `pauser`
 - reverts if already unpaused

#### setPauser
Arguments:
 - `_pauser` (address) -  the new address to be the `pauser`

Sets a new `pauser`. The old `pauser` is overwritten.

##### Security Notes
 - only callable by the `roleAdmin`

### VoteCheckpoints
 - Inherits: `ERC20Pausable`, `DelegatePermit`

The `VoteCheckpoints` contract adds the tracking for voting in the Eco governance system. Here, the system of delegating voting power and checkpointing balances for that voting power is implemented. This contract sits before the linear inflation layer ([InflationCheckpoints](./README.md#inflationcheckpoints)), so all the values it stores, emits, and takes as inputs are in the base (unchanging) values stored in the ERC20 layer. This will require contracts interfacing with this layer to use the inflation multiplyer.

 #### Events

 ##### DelegatedVotes
 Attributes:
  - `delegator` (address) - the address that is delegating votes
  - `delegatee` (address) - the address who is the recipient of delegation
  - `amount` (uint256) - the amount of votes delegated.

This event is emitted by the `delegate` function to provide a record of the change of delegation.

##### UpdatedVotes
Attributes:
 - `voter` (address) - the address whose voting power has changed
 - `newVotes` (uint256) - the new voting balance after the change

This event is emitted when delegation or a transfer causes a change in voting power. This is most relevant in the case of a transfer when the `delegate` is not an address recieving/sending the transfer.

##### NewPrimaryDelegate
Attributes:
 - `delegator` (address) - the address choosing a delegate
 - `primaryDelegate` (address) - the address chosen as a primary delegate

Emitted when primary delegation is chosen to denote that the new delegate has the special status afforded to primary delegates.

#### totalSupplyAt
Arguments:
 - `_blockNumber` (uint256) - the block number at which to check the total supply.

Passes through to `getPastTotalSupply`. Exists as a virtual function to be overridden in the child contract to account for inflation.

#### getPastTotalSupply
Arguments:
 - `blockNumber` (uint256) - the block number at which to check the total supply.

This function looks up the value in the checkpoint for total supply that occurs soonest before `blockNumber`. This lookup is done via a binary search through the `_totalSupplyCheckpoints` array. 

##### Security Notes
 - Reverts if `_blockNumber` is greater than or equal to the current block number.
 - If no checkpoint is found before the requested block number, 0 is returned.

#### getPastVotes
Arguments:
 - `_owner` (address) - the address for which to look up the ECO voting power
 - `_blockNumber` (uint256) - the block number at which to check the total supply.

Passes through to `getPastVotingGons`. Exists as a virtual function to be overridden in the child contract to account for inflation.

##### Security Notes
 - This is not the same as the user's balance at the time. This is used purely for looking at snapshotted voting power and accounts for the delegation decisions of the `_owner` address.
 - Reverts if `_blockNumber` is greater than or equal to the current block number.

#### getPastVotingGons
Arguments:
 - `account` (address) - the address for which to look up the ECO voting power
 - `blockNumber` (uint256) - the block number at which to check the total supply.

This function looks up the value in the checkpoint for user checkpoint that occurs soonest before `blockNumber`. This lookup is done via a binary search through the `checkpoints` array for the `account` address.

##### Security Notes
 - This is not the same as the user's balance at the time. This is used purely for looking at snapshotted voting power and accounts for the delegation decisions of the `account` address.
 - Reverts if `_blockNumber` is greater than or equal to the current block number.
 - If no checkpoint is found before the requested block number, 0 is returned.

#### getVotingGons
Arguments:
 - `account` (address) - the address to get votes for

Returns the most recent checkpoint for `account`.

#### numCheckpoints
Arguments:
 - `account` (address) - the address for which to return the number of checkpoints

Returns the length of the checkpoint array for `account` cast as a uint32. Made for ease of access to the mapping `checkpoints`.

#### isOwnDelegate
Arguments:
 - `account` (address) - the address to check delegation status for

Returns `true` if the `account` has zero outstanding delegations and `false` otherwise.

#### getPrimaryDelegate
Arguments:
 - `account` (address) - the address to get the primary delegate for.

Returns the current primary delegate for `account`. If the `account` is its own delegate (i.e. a delegate has not been set), `account` will be returned. Note that each account is its own primary delegate by default. This function is used when determining where votes should be assigned when tokens are transferred to an address.

#### enableDelegationTo
Argument: none

Sets the senders address as available for primary delegation in `delegationToAddressEnabled`. This is added because primary delegates are taking on the responsibility to vote for the people delegating to them. Additionally, this sets `delegationFromAddressDisabled` to true. The way delegation is implemented, there is no chaining: you can never delegate votes delegated to you. This extra step is to constrain user behavior so that they do not believe they can do this.

##### Security Notes
 - Can only be called if `isOwnDelegate` returns true.
 - Causes all calls to all forms of delegation to revert.

#### disableDelegationTo
Argument: none

Sets `delegationToAddressEnabled` back to false for the sender. Note, this doesn't allow the user to delegate again, just disallows users to delegate to them.

#### reenableDelegating
Arguments: none

Sets `delegationFromAddressDisabled` back to false for the sender, if the requirements are met.

##### Security Notes
 - Can only be called if `getVotingGons` returns the same value as the user balance. This is equivalent to the fact that the user has no one delegating to them.
 - This requirement is not necessarily achievable. Likely, the best path is to move tokens to another address if you wish to delegate them.

#### delegate
Arguments:
 - `delegatee` (address) - the address that the sender is delegating to

Sets the `delegatee` as the primary delegate for the sender. Requires that `delegatee` has called `enableDelegationTo` and requires that the sender is either completely undelegated or delegated to another primary delegate. Moves the voting power afforded by the users balance to the `delegatee`. Emits a `DelegatedVotes` and a `NewPrimaryDelegate` event for the user as well as `UpdatedVotes` events for everyone involved, including the previous primary delegate if applicable.

##### Security Notes
 - Will revert if the sender has primary delegation to them enabled
 - Addresses cannot use this function to delegate to themselves, they must instead use `undelegate`. You cannot delegate and have delegation enabled, so a call of delegate will fail for one reason or another.

#### delegateBySig
Arguments:
 - `delegator` (address) - the signer to delegate for
 - `delegatee` (address) - the address to delegate to
 - `deadline` (uint256) - the deadline for the signature
 - `v` (uint8) - the v part of the signature
 - `r` (bytes32) - the r part of the signature
 - `s` (bytes32) - the s part of the signature

Uses the functionality of `DelegatePermit` to allow anyone with a signature to call delegate on behalf of another user. See documentation for `DelegatePermit` for more details. Follows the same rules as `delegate`.

#### delegateAmount
Arguments:
 - `delegatee` (address) - the address to delegate to
 - `amount` (uint256) - the amount to delegate

This function allows an address to delegate only part of its voting power to another address. Any address may be targeted by this, not just addresses that have enabled primary delegation. This function can be called multiple times for multiple addresses. This interface is generally designed for use by contracts that are managing funds from multiple users. For an example of this usage, see the `Lockup` contract [here](../governance/monetary/README.md#lockup).

##### Security Notes
 - THIS AMOUNT, LIKE EVERY OTHER AMOUNT ON THIS CONTRACT, IS IN TERMS OF THE BASE VALUE OF THE TOKEN, NOT IN TERMS OF INFLATED AMOUNTS.
 - The amount chosen cannot be larger than the currently undelegated amount.
 - This amount must be manually undelegated before transferring. Only undelegated or primary delegated tokens can be transferred.
 - You cannot delegate amounts to yourself.

#### undelegate
Arguments: none

An alias for `undelegateFromAddress` for the sender's primary delegate.

#### undelegateFromAddress
Arguments:
 - `delegatee` (address) - the address to undelegate from

Looks up the amount delegated by the sender to the specified address and then moves that much voting power back to the sender. If the `delegatee` is the primary delegate for the sender, the sender will no longer have a primary delegate.

##### Security Notes
 - Can never undelegate funds that haven't been delegated prior.
 - Can be called on addresses that haven't been delegated anything, but has no effect (does not revert).

#### undelegateAmountFromAddress
Arguments:
 - `delegatee` (address) - the address to undelegate from
 - `amount` (uint256) - the amount of voting power to undelegate

Undelegates a specified amount from an address. Is only available to amounts set by `delegateAmount`, cannot be used if the sender has a primary delegate. Is useful for contracts that use `delegateAmount` if multiple addresses require delegating to the same address.

###### Security Notes
 - Will revert if `amount` is greater than the total delegation to the `delegatee`.

### DelegatePermit
 - Inherits: `EIP712`

Implements a standard usage of EIP721 (read more [here](https://eips.ethereum.org/EIPS/eip-712)) for the `delegate` function. The typehash `keccak256("Delegate(address delegator,address delegatee,uint256 nonce,uint256 deadline)")` is used and the openzeppelin utility for `Counters` is used for the nonces. Other than allow the checking of nonces for addresses, all functionality of this contract is internal.

#### delegationNonce
Arguments:
 - `owner` (address) - the address to check the nonce for

Returns the current unused nonce for the `owner`.

### InflationCheckpoints
 - Inherits: `VoteCheckpoints`, `PolicedUtils`, `IGenerationIncrease`

This contract takes the functionality outlined in `VoteCheckpoints` and adds the effects of linear inflation. The multiplier for inflation is stored in its own checkpoints array that functions the same as the voting power checkpoints in `VoteCheckpoints`. The initial value of the multiplier is stored in the constant `INITIAL_INFLATION_MULTIPLIER` and is 10e18.

#### Events

##### BaseValueTransfer
Attributes:
 - from (address) - the sender address
 - to (address) - the recipient of the transfer
 - value (uint256) - the amount transferred in the base value, stored in the underlying data structure (does not change with inflation)

Used to help external integrations that only use events to build their internal representation of the currency to still be able to track the uninflated values stored for each user. The ERC20 event, Transfer, occurs before the `_beforeTokenTransfer` hook has been called and the values converted from inflation variable values into static base values.

#### getPastLinearInflation
Arguments:
 - `blockNumber` (uint256) - the block number at which to check the inflation multiplier

Returns the value of the inflation multiplier at the earliest checkpoint before `blockNumber` using a binary search.

##### Security Notes
 - Reverts if `blockNumber` is greater than the current block number.
 - If no checkpoint is found before the requested block number, 0 is returned. However, construction writes a checkpoint with the initial multiplier so it will only return zero if a block number before the launch of the currency is used. Specifying a block this early will likely cause a revert on all other functions as the inflation multiplier divides out inputs.

#### balanceOf
Arguments:
 - `_owner` (address) - the address for which to get the balance

Overrides the `balanceOf` function in `ERC20` to account for inflation. The uninflated value stored in the `ERC20` store is divided by the most recent inflation multiplier before the block when the function is called. This is the value of the balance in ECO.

##### Security Notes
 - the division is done via deterministic integer division with truncation

#### totalSupply
Arguments: none

Overrides the `totalSupply` function in `ERC20` to account for inflation. The uninflated value stored in the `ERC20` store is divided by the most recent inflation multiplier to the current block when the function is called.

##### Security Notes
 - the division is done via deterministic integer division with truncation

#### totalSupplyAt
Arguments:
 - `_blockNumber` (uint256) - the block number at which to check the total supply.

Overrides the `totalSupplyAt` function in `VoteCheckpoints` to account for inflation. The uninflated value stored in the checkpoint is divided by the most recent inflation multiplier to `_blockNumber`.

##### Security Notes
 - the division is done via deterministic integer division with truncation

#### getPastVotes
Arguments:
 - `_owner` (address) - the address for which to look up the balance
 - `_blockNumber` (uint256) - the block number at which to check the total supply.

Overrides the `getPastVotes` function in `VoteCheckpoints` to account for inflation. The uninflated value stored in the checkpoint is divided by the most recent inflation multiplier to `_blockNumber`.

##### Security Notes
 - This is not the same as the user's balance at the time. This is used purely for looking at snapshotted voting power of accounts to account for the delegation decisions of the `account` address.
 - the division is done via deterministic integer division with truncation
 - still reverts for current and future blocks as with `getPastVotes` in `VoteCheckpoints.sol`


### ECO
 - Inherits: `InflationCheckpoints`

The `ECO` contract manages the function of the primary token, ECO. Its constructor sets the `name` and `symbol` values for `ERC20` both to "ECO". On creation it mints an initial supply to a distributor contract, both set in the constructor. See [TokenInit](./README.md#tokeninit) for more details on the distribution. The rest of the functionality is permissioning `mint` and `burn` as well as recieving the inflation multiplier each generation.

#### Events

#### mint
Arguments:
 - `_to` (address) - the address receiving the minted tokens
 - `_value` (uint256) - the amount of ECO to mint

This function enforces that only the [CurrencyTimer](../governance/README.md#currencytimer), [ECOx](./README.md#ecox), and ECO Labs (used in proposals for minting) interface labels can call it.

##### Security Notes:
 - the only accepted hashes are `ID_CURRENCY_GOVERNANCE`, `ID_CURRENCY_TIMER`, `ID_ECOX`, and `ID_FAUCET` (tests only). See the [Policy Readme](../policy/README.md) for more details on how this is enforced.

#### burn
Arguments:
 - `_from` (address) - the address supplying the burned tokens
 - `_value` (uint256) - the amount of ECO to burn

This function enforces that only `_from` or the [CurrencyTimer](../governance/README.md#currencytimer) can call it.

##### Security Notes:
 - users can only burn their own tokens (not other users')
 - the only accepted policy that can burn users' tokens are `ID_CURRENCY_TIMER`. See the [Policy Readme](../policy/README.md) for more details on how this is enforced. This is done to enact a deflationary penalty for early withdrawal of lockups.

#### notifyGenerationIncrease
Arguments: none

See the `TimedPolicies` contract [here](../governance/README.md#timedpolicies) for a better understanding of when this function is called.

This is part of the generation increase machinery. The `currentGeneration` is increased and the results of the most recent `CurrencyGovernance` vote (see [here](../governance/monetary/README.md#currencygovernance) for more details) is checked to see if any additional linear inflation was added. If there is a change, the new value of the linear inflation multiplier will be multiplied by the current value and written to a checkpoint.

##### Security Notes
 - Can only be called if the `TimedPolicies` contract has increased its generation compared to the `currentGeneration` stored in this contract.

### ECOx
 - Inherits: `ERC20Pausable`, `PolicedUtils`

The `ECOx` contract is a baseline `ERC20Pausable` without minting or burning (outside of proposals) with the added ability to exchanged ECOx for ECO tokens in a percentage way. The ECOx token exists for this function alone so as to provide a market for the future of the ECO token. Finally, much like ECO, the ECOx contract mints its initial supply to a distributor on construction, see [TokenInit](./README.md#tokeninit) for more details.

#### exchange
Arguments:
 - `_ecoXValue` (uint256) - the amount of ECOx for the calling address to exchange

This function burns the specified amount of ECOx and mints the user ECO in return. The percentage that the burned ECOx was of the total initial supply of ECOx (stored in the variable `initialSupply`) is equal to the ECO given as a percentage of the current total supply of ECO, but continuously compounded along the process. This follows an exponential function relation between the two ratios. See the [Eco whitepaper](https://eco.org/whitepaper.pdf) for more discussion.

##### Security Notes
 - The exponential calculation is achieved via a 33rd term taylor expansion. The input value is fed into a polynomial with precomputed coefficients and uses 100 bits of precision on the integer division. This gives a precision of approximately 1 in 10^24 when converting an amount as large as half the total supply, with more accuracy as the conversions approach zero. Then there is also a rounding error of 1 of the smallest unit of ECO when converting amounts as small as 10^-13 of the total supply.
 - Left shifting for the sake of precision is done via a `safeLeftShift` function that reverts if there's an overflow. If this managed to occur, a user could just convert a portion of their ECOx at a time. The formula for calculation does not change the final amount if the conversion is done in pieces or all at once.

#### valueAt
Arguments:
 - `_ecoXValue` (uint256) - the value of ECOx to be appraised
 - `_blockNumber` (uint256) - the block number to fetch the total ECO supply at

Returns the value of ECO that the ECOx would be worth at the specified `_blockNumber`, if it had been exchanged.

#### ecoValueOf
Arguments:
 - `_ecoXValue` (uint256) - the value of ECOx to be appraised

Returns the value of ECO that the ECOx would be worth given the current total ECO supply, if it was to be exchanged.

#### mint
Arguments:
 - `_to` (address) - the address receiving the minted tokens
 - `_value` (uint256) - the amount of ECOx to mint

Mainly for use in tests, this can be called by two identifiers (`ID_FAUCET` and `ID_ECO_LABS`) that are not assigned to contracts.

##### Security Notes:
 - While it is possible to configure a policy proposal to call this function, it is not intended.

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md). Note that some files in this directory are under different licenses. See file headers for details where applicable.

### TokenInit
Inherits: `Ownable`

Used to distribute the initial supply, both ECO and ECOx use a `TokenInit` contract. The token mints the initial supply in its constructor (and initialize function for when it's proxied) to this contract. Then `distributeTokens` performs the distribution. As all parts of this process are part of the deploy, usage is permissioned to the deployer.

#### distributeTokens
Arguments:
 - `_token` (address) - the address of the ERC20 token to distribute for.
 - `_initialHolders` (address[]) - an array of addresses of the initial holders.
 - `_initialBalances` (uint256[]) - an array of balances to transfer to each in `_initialHolders`

This function expects both arrays to have the same length and for the address to be a token contract for which this contract already holds tokens. It transfers the first amount in `_initialBalances` to the first address in `_initialHolders`, second to second, and so on and so forth. It assumes that `_initialBalances` sums to an amount less than or equal to the balance of this contract and makes no check to assure that there are no duplicates in `_initialHolders`. Only the deployer of this contract can call this function.
