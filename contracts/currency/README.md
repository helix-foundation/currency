# The Eco Currency
> Contracts implementing the Eco currency.

This implements the ECO Cryptocurrency, and its partner token ECOx, in the form of smart contracts on the Ethereum VM. Contracts are written in Solidity, tests are in JavaScript.

## Table of Contents
 - [Security](#security)
 - [Background](#background)
 - [Install](#install)
 - [Usage](#usage)
 - [API](#api)
 - [Contributing](#contributing)
 - [License](#license)

## Security
The Eco currency implementation is designed to be managed by the [Currency Governance System](../governance). Other deployments have not been considered.

## Background
The ECO and ECOx ERC20 tokens are managed by the `ECO` and `ECOx` contracts respectively, inhereting from a slightly modified copy of `ERC20.sol` in our repository. ECO's extra functionality added on top of this standard is tied to our governance system. ECOx just adds the functionality to convert into ECO.

The first main function of ECO is a checkpointing system that operates off the post-transfer hooks. The checkpoint system is only used as a snapshot for voting in our governance system (see the `PolicyVotes` contract [here](../governance)). This allows for methods to lookup up the user's balance at the time (block number) of the vote in question.

The ECO token supports linear inflation (increasing all balances by a multiplier) and the effects of this operation is detailed in the `InflationCheckpoints` contract, a parent of `ECO`. The balances are stored in "uninflated" units that are not affected by inflation actions. The balances are then returned as the uninflated balance divided by the inflation factor. The inflation multiplier is stored in its own set of checkpoints to facilitate historical balance lookups.

Finally, ECO can also be delegated. This means that the owner's balance is tracked in the checkpoints for the delegate. Delegates can be set within the `VoteCheckpoints` contract, which is a parent of `InflationCheckpoints` and therefore `ECO`. Each address is, by default, its own delegate.

The ECOx token adds the functionality to convert ECOx into ECO. The amount of ECO gained is based on the percentage of total supply as the ECOx burned (explained in detail in the API). ECOx does not have inflation in its design and its voting is handled by a staking/lockup contract instead of by checkpoints.

### References

 - [ERC20](https://theethereum.wiki/w/index.php/ERC20_Token_Standard)
 - [ERC1820](https://eips.ethereum.org/EIPS/eip-1820)

## Install
See the [main README](../../README.md) for installation instructions.

## Usage
The currency contracts are intended for deployment on the Ethereum blockchain, using Eco's [Governance System](../governance) (built on the [policy framework](../policy)). Each currency contract is built to handle the balances and peer to peer actions of token holding addresses.

## API

### VoteCheckpoints
 - Inherits: `ERC20`

 The `VoteCheckpoints` contract adds the first layer of functionality on top of [ERC20](https://theethereum.wiki/w/index.php/ERC20_Token_Standard). Here, the system of delegating voting power and checkpointing balances for that voting power is implemented. As this contract is eventually inherited by the `ECO` contract, some of its functionality exists as private functions only called by methods in child contracts. That functionality will be explained there when used.

 #### Events

 ##### DelegateChanged
 Attributes:
  - `delegator` (address) - the address that is changing its delegate
  - `fromDelegate` (address) - the previous delegate
  - `toDelegate` (address) - the new delegate for the address

This event is emitted by the `delegate` function to provide a record of the change of delegation.

##### DelegateVotesChanged
Attributes:
 - `delegate` (address) - the delegate whose voting power has changed
 - `previousBalance` (uint256) - the previous voting balance
 - `newBalance` (uint256) - the new voting balance after the change

This event is emitted when delegation is changed or when a transfer occurs to show the change in voting power. This is most relevant in the second case when the `delegate` is not the address recieving/sending the transfer.

#### totalSupply
Arguments: none

This function returns the total ECO in circulation. Is an alias of `tokenSupply`.

#### tokenSupply
Arguments: none

This function returns the total ECO in circulation as stored in the `_totalSupply` variable from `ERC20`. Is overridden in the child contract to account for inflation.

#### balanceOf
Arguments:
 - `account` (address) - the address for which to get the balance

This function returns the amount of ECO attributed to the address. Is an alias of the function `balance` which is overidden in the child contract.

#### balance
Arguments:
 - `account` (address) - the address for which to get the balance

This function returns the amount of ECO attributed to the address in the `_balances` mapping from `ERC20`. Is overidden in the child contract to account for inflation.

#### totalSupplyAt
Arguments:
 - `_blockNumber` (uint256) - the block number at which to check the total supply.

An alias for `getPastTotalSupply`. Is overidden in the child contract to account for inflation.

#### getPastTotalSupply
Arguments:
 - `blockNumber` (uint256) - the block number at which to check the total supply.

This function looks up the value in the checkpoint for total supply that occurs soonest before `blockNumber`. This lookup is done via a binary search. Is overidden in the child contract to account for inflation.

##### Security Notes
 - Reverts if `_blockNumber` is >= the current block number.
 - If no checkpoint is found before the requested block number, 0 is returned.

#### balanceAt
Arguments:
 - `_owner` (address) - the address for which to look up the balance
 - `_blockNumber` (uint256) - the block number at which to check the total supply.

An alias for `getPastVotes`. Is overidden in the child contract to account for inflation.

##### Security Notes
 - This is not the same as the user's balance at the time. This is used purely for looking at snapshotted voting power and accounts for the delegation decisions of the `account` address.

#### getPastVotes
Arguments:
 - `account` (address) - the address for which to look up the balance
 - `blockNumber` (uint256) - the block number at which to check the total supply.

This function looks up the value in the checkpoint for user balance that occurs soonest before `blockNumber`. This lookup is done via a binary search. Is overidden in the child contract to account for inflation.

##### Security Notes
 - This is not the same as the user's balance at the time. This is used purely for looking at snapshotted voting power and accounts for the delegation decisions of the `account` address.
 - Reverts if `blockNumber` is >= the current block number.
 - If no checkpoint is found before the requested block number, 0 is returned.

#### checkpoints
Arguments:
 - `account` (address) - the address for which you're accessing the checkpoint
 - `pos` (uint32) - the position in the list of checkpoints for the account

Returns the checkpoint for `account` at the position specified. Made for ease of access to the mapping, `_checkpoints`.

#### numCheckpoints
Arguments:
 - `account` (address) - the address for which to return the number of checkpoints

Returns the length of the checkpoint array for `account` cast as a uint32. Made for ease of access to the mapping, `_checkpoints`.

#### delegates
Arguments:
 - `account` (address) - the address to look up delegates for

Returns the current delegate for `account`. If the `account` is its own delegate (i.e. a delegate has not been set), `account` will be returned. Note that this applies to using this function for an acconut that's completely unused as each account is its own delegate by default.

#### getVotes
Arguments:
 - `account` (address) - the address to get votes for

Returns the most recent checkpoint for `account`.

#### delegate
Arguments:
 - `delegatee` (address) - the address that the sender is delegating to

Sets the delegate for the `msg.sender` from its current delegate to `delegatee`. Moves voting power equal to balance of `msg.sender` from the previous delegate to `delegatee`. Emits a `DelegateChanged` and a `DelegateVotesChanged` event.

### InflationCheckpoints
 - Inherits: `VoteCheckpoints`, `PolicedUtils`, `ITimeNotifier`

This contract takes the functionality outlined in `VoteCheckpoints` and adds the effects of inflation. The multiplier for inflation is stored in its own checkpoints array that functions the same as the voting power checkpoints in `VoteCheckpoints` except the inflation multiplier is stored instead of the balances. The initial value of the multiplier is stored in the constant `INITIAL_INFLATION_MULTIPLIER` and is 10e18.

#### getPastLinearInflation
Arguments:
 - `blockNumber` (uint256) - the block number at which to check the inflation multiplier

Returns the value of the inflation multiplier at the earliest checkpoint before `blockNumber` using a binary search.

##### Security Notes
 - Reverts if `blockNumber` is >= the current block number.
 - If no checkpoint is found before the requested block number, 0 is returned. However, construction writes a checkpoint with the initial multiplier so it will only return zero if a block number before the launch of the currency is used.

#### balance
Arguments:
 - `account` (address) - the address for which to get the balance

Overrides the `balance` function in `VoteCheckpoints` to account for inflation. The uninflated value stored in the `ERC20` store is divided by the most recent inflation multiplier to the current block when the function is called.

##### Security Notes
 - the division is done via deterministic integer division with truncation

#### balanceAt
Arguments:
 - `_owner` (address) - the address for which to look up the balance
 - `_blockNumber` (uint256) - the block number at which to check the total supply.

Overrides the `balanceAt` function in `VoteCheckpoints` to account for inflation. The uninflated value stored in the checkpoint is divided by the most recent inflation multiplier to `_blockNumber`.

##### Security Notes
 - This is not the same as the user's balance at the time. This is used purely for looking at snapshotted voting power and accounts for the delegation decisions of the `account` address.
 - the division is done via deterministic integer division with truncation

#### tokenSupply
Arguments: none

Overrides the `tokenSupply` function in `VoteCheckpoints` to account for inflation. The uninflated value stored in the `ERC20` store is divided by the most recent inflation multiplier to the current block when the function is called.

##### Security Notes
 - the division is done via deterministic integer division with truncation

#### totalSupplyAt
Arguments:
 - `_blockNumber` (uint256) - the block number at which to check the total supply.

Overrides the `totalSupplyAt` function in `VoteCheckpoints` to account for inflation. The uninflated value stored in the checkpoint is divided by the most recent inflation multiplier to `_blockNumber`.

##### Security Notes
 - the division is done via deterministic integer division with truncation

### ECO
 - Inherits: `InflationCheckpoints`, `TimeUtils`

The `ECO` contract manages the function of our primary token, ECO. Its constructor sets the `name` and `symbol` values for `ERC20` to "Eco" and "ECO" respectively. The main functionality added is permissioning and interfacing with the governance contracts.

#### Events

##### InflationRootHashProposalStarted
Attributes:
 - `inflationRootHashProposalContract` (address) - the address of the newly created `InflationRootHashProposal` contract.
 - `generation` (uint256) - the generation in which the decision to add random inflation would be made. This is generally the generation before the call to `notifyGenerationIncrease` is made.

This event marks a `notifyGenerationIncrease` action where the `InflationRootHashProposal` contract is set up and its address is stored in the mapping `rootHashAddressPerGeneration`, keyed by the generation that just ended (same as in the event). See the `InflationRootHashProposal` docs [here](../governance README.md) for more details.

#### mint
Arguments:
 - `_to` (address) - the address receiving the minted tokens
 - `_value` (uint256) - the amount of ECO to mint

This function enforces that only the permissioned contracts can call it. Functionality of the `_mint` function from `ERC20` is overridden so that delegated voting power is updated and checkpoints are written.

##### Security Notes:
 - the only accepted policies are `ID_CURRENCY_GOVERNANCE`, `ID_CURRENCY_TIMER`, `ID_ECOX`, and `ID_FAUCET` (tests only). See the [Policy Readme](../policy/README.md) for more details on how this is enforced.

#### notifyGenerationIncrease
Arguments: none

See the `TimedPolicies` contract [here](../governance) for a better understanding of when this function is called.

This is part of the generation increase machinery. The `currentGeneration` is increased and the results of the most recent `CurrencyGovernance` vote (see [here](../governance/README.md) for more details) is checked to see if any additional linear inflation was added. If there is a change, the new value of the linear inflation multiplier will be multiplied by the current value and written to a checkpoint.

##### Security Notes
 - Can only be called if the `TimedPolicies` contract has increased its generation compared to the `currentGeneration` stored in this contract.

### ECOx
 - Inherits: `ERC20`, `PolicedUtils`

The `ECOx` contract adds the ability to exchanged ECOx for ECO tokens to the `ERC20` standard. The ECOx token exists for this function alone so as to provide a market for the future of the ECO token.

#### exchange
Arguments:
 - `_ecoXValue` (uint256) - the amount of ECOx for the calling address to exchange

This function burns the specified amount of ECOx and gives the user ECO in return. The percentage that the burned ECOx was of the total initial supply of ECOx is equal to the ECO given as a percentage of the current total supply of ECO, but continuously compounded along the process. This creates an exponential function relation between the two ratios. See [our whitepaper](tbd) for more discussion.

##### Security Notes
 - The exponential relation is achieved via a 34 term taylor expansion. The input value is fed into a polynomial with precomputed coefficients and uses 100 bits of precision on the integer division.

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

Only callable by `ID_FAUCET` for tests.

##### Security Notes:
 - While it is possible to configure a policy proposal to call this function, it is not intended so no concessions have been made to ease this process and the proposal must masquerade as `ID_FAUCET`.

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md). Note that some files in this directory are under different licenses. See file headers for details where applicable.
