# The Eco Currency
> Contracts implementing the Eco currency.

This implements the Eco Cryptocurrency, in the form of smart contracts on the
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
[Inflation & Governance System](../inflation). Other deployments have
not been considered.

## Background
The Eco currency is designed to support multiple concurrent token interfaces by
isolating the account balance store from the token interfaces. The sole
exception is the ERC20 interface, which is implemented directly in the balance
store for simplicity.

The `EcoBalanceStore` contract implements a generational balance store for all
token interfaces that Eco might support. It is upgradeable using the policy
framework laid out in the Eco Policed Contracts project, and supports the usual
extra token functionality like minting and burning. Users cannot interact
directly with the `EcoBalanceStore` and instead will use various privileged
token interfaces to do so.

Token interfaces are authorized using the policy framework, and once authorized
can perform balance transfer and token burn actions on the balance store.
![AuthorizedContracts and EcoBalanceStore](https://www.lucidchart.com/publicSegments/view/064a068d-5526-4569-8e1e-54d27b9dc15d/image.png)
Eco Currency as a Class Diagram
![Eco Currency as a Class Diagram](https://www.lucidchart.com/publicSegments/view/d099a70f-18a8-4519-89a8-2f9d2797c0c3/image.png)

### The Generational Store
The `EcoBalanceStore` uses a multi-generational database architecture. Periodic
_checkpoints_ are created for every account, with the set of balances at the
last checkpoint being known as the "previous generation". Balances for past
generations are immutable - only the present generation ever changes.

The store maintains roughly twelve generations (possibly more, when garbage
collection hasn't happened in a while), with each generation lasting roughly
one month (~365.25/12 days, measured in seconds).

Every time a transfer is made account balances are first checked for
checkpointing. If the previous generation checkpoint does not exist for either
account the checkpoint is created from the pre-transfer balance for that
account. Checkpoints can also be explicitly created using the `updateTo` method.
Old checkpoints (more than 12 generations ago) for the account are cleaned up
during the new checkpoint creation to reduce storage requirements.

Checkpoints are used to allow stake-weighted voting without requiring funds
lockup. By using the previous generation checkpoint as the weight of any stake
weighted vote it becomes impossible to count the same staked tokens twice.

### References
Several outside sources are either included here with minimal modification or
were influential in the development of the contracts in this directory.

 - [ERC777](https://eips.ethereum.org/EIPS/eip-777)
 - [ERC777 Reference Implementation](https://github.com/0xjac/ERC777)

## Install
See the [main README](../../README.md) for installation instructions.

## Usage
The currency contracts are intended for deployment on the Ethereum blockchain,
using Eco's [Governance System](../inflation) (built on the
[policy framework](../policy)). The currency provides an
[ERC20](https://theethereum.wiki/w/index.php/ERC20_Token_Standard) token
interface, which is how most systems will interact with it. In addition to
ERC20, interfaces are provided conforming to ERC777. The governance
system can be used to add new interfaces in the future.

## API
### ERC20
See [The Ethereum Wiki's ERC20 page](https://theethereum.wiki/w/index.php/ERC20_Token_Standard)
for details on the ERC20 interface.

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md). Note that some files in this directory
are under different licenses. See file headers for details where applicable.
