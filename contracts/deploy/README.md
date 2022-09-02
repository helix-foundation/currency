# Eco Bootstrap
> Contracts used as part of the deployment process.

These contracts are used only as part of the deployment process.

## Table of Contents
 - [Security](#security)
 - [Background](#background)
 - [Install](#install)
 - [Usage](#usage)
 - [API](#api)
 - [Contributing](#contributing)
 - [License](#license)

## Security
The security of these contracts is based on the principle of ownership. The root contract (`EcoBootstrap`) uses the `Ownable` implementation from [OpenZeppelin](https://docs.openzeppelin.com/contracts/2.x/access-control) and the place holder contract (`EcoInitializable`) has its own minimalist ownership implementation.

## Background
For convenience, Eco would like to pre-allocated a fixed set of addresses across all of the Ethereum networks we deploy to. This allows us to simplify our processes by removing address lookup steps in the deploy - the addresses are the same regardless of the network, given the same deploying address. It also simplifies dApp development and testing by allowing developers to move their dApps between networks without any configuration or code changes.

To achieve this we borrow the code for [Nick's Method](https://weka.medium.com/how-to-send-ether-to-11-440-people-187e332566b7) from [ERC1820](https://weka.medium.com/how-to-send-ether-to-11-440-people-187e332566b7) and deploy our bootstrap contract (`EcoBootstrap`) to allocate a number of addresses. Because Nick's Method produces identical deployment addresses across all networks and the addresses of contracts deployed from within a contract are deterministic the addresses allocated in this process will be the same on every network, or the process will fail.

To allow re-allocation of the addresses later a proxy contract is deployed to each of the allocated addresses, and an initialization place holder (`EcoInitializable`) is configured as the target.

`EcoInitializable` allows its owner to update the target of a `ForwardProxy` one time, at some point in the future. See [here](../proxy/) for our proxy contracts.

During the currency deployment process the chosen proxy addresses are re-targeted to point at contracts that require a static address and/or a permanent storage. The mapping of which proxy addresses to which underlying implementation contracts must be followed on other networks for true portability cross-network.

## Install
See the [main README](../../README.md) for installation instructions.

## Usage
The bootstrap is deployable to an Ethereum network using the Nick's Method utility [here](../../tools/nicks.js) to generate a relocatable and repeatable deployment transaction.

### Compile the contracts
```bash
npm run build
```

### Generate a transaction file (eg `bootstrap-truffle.json`):
```bash
node ../../tools/nicks.js -s 0x0abababababababababababababababababababababababababababababababa -g 200000 -d "0x6bAB1BD10Aa94431FF5d5bad537C93fCC2A78843" -o bootstrap.json ../../build/contracts/EcoBootstrap.json
```
`-s`: Set the s-parameter of the transaction. This should be something pseudo-deterministic.

`-o`: Output the transaction data to a file. Use `-` or omit to use stdout.

`-d`: Encoded arguments to pass to the constructor.

`-g`: Gas limit. Defaults to 800000

Replace `0x6bAB1BD10Aa94431FF5d5bad537C93fCC2A78843` with the address that should own the allocated proxy addresses (the deployer address).

### Deploy using web3
```javascript
// Load the transaction data
txdata = require('./bootstrap.json')
// Fund the account that will run the transaction via the first test account
gasCost = web3.utils.toBN(txdata.tx.gasPrice).mul(web3.toBN(txdata.tx.gasLimit))
await web3.eth.sendTransaction({from:(await web3.eth.getAccounts())[0],to:txdata.from,value:gasCost})
// Run the transaction
web3.eth.sendSignedTransaction(txdata.raw)
```

## API
### EcoInitializable
 - Inherits: `ForwardTarget`

A layer on top of a standard proxy for facilitating and permissioning which address can link the proxy to a proxyable target.

#### fuseImplementation
Arguments:
 - `_impl` (address) - the address of the new proxy target contract

Updates the proxy contract's implementation pointer to point to the address specified in `_impl` and delegatecalls the `initialize` function to configure the storage context as specified by the new proxy target. It then sets the `owner` to `address(0)` as its job is done.

##### Security Notes
 - Can only be called by the contract owner.

### EcoBootstrap
 - Inherits: `Ownable`

Creates and indexes the `EcoInitializable` contracts for setting up the ECO deploy. Has no external functions except for getters. The immutable variable `NUM_PLACEHOLDERS` holds the number of `EcoInitializable` contracts instantiated. The array `placeholders` holds the addresses of these contracts.

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md).
