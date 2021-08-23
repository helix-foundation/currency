# Eco Currency and Governance _(currency)_
[![Build Status](https://travis-ci.com/eco/currency.svg?token=Ys7HacuB4cQ6EmcRgqK1&branch=master)](https://travis-ci.com/eco/currency)
[![Coverage Status](https://coveralls.io/repos/github/eco/currency/badge.svg?branch=master&t=lVk4ix)](https://coveralls.io/github/eco/currency?branch=master)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)
> The Eco cryptocurrency contracts, governance contracts, and associated
> tooling.

The Eco cryptocurrency and governance system are implemented here, along with
all the custom tools, frameworks, and tests used primarily for the currency
system.

The project can be broken into 4 major components:
 - [The token implementation](contracts/currency)
 - [The policies framework](contracts/policy)
 - [The governance system](contracts/governance)
 - [The VDF implementation](contracts/VDF)
 - [The deployment tooling](contracts/deploy)

Each component is documented in a README file in the corresponding contracts
directory. See the [Background](#background) section for an overview of how they
fit together.

## Table of Contents
 - [Security](#security)
 - [Background](#background)
 - [Install](#install)
 - [Usage](#usage)
 - [Components](#components)
 - [Maintainers](#maintainers)
 - [Contributing](#contributing)
 - [License](#license)

## Security
### Note on the 0 Address
Although it is common in the wider community, Eco contracts do not block
transfers to the 0 address, or take similar steps to prevent users from harming
themselves. Intentional interactions with the 0 address would simply be replaced
by another unlikely address, and accidental interactions are best prevented at
the user interface.

It is possible (although difficult) to recover tokens transferred to the 0
address using the governance process. Do not rely on this, as doing so requires
a policy vote of all token holders.

### Note on Solidity Optimizations
This repository has non-default compiler optimizations turned on! This can, in
some cases, result in unexpected behaviour. Our test suites are designed to be
run with optimizations configured as they are when we deployed and will not
detect changes in behaviour caused by the optimizer.

If you believe the optimizer may be changing the behaviour of your code please
test with the optimizer disabled to verify and discuss with the team.

### Reporting Vulnerabilities
If you believe you've identified a security vulnerability in our contracts or
other software please reach out to eng at eco dot com via email to ensure we're
able to respond promptly.

## Background
The Eco cryptocurrency is designed to be a low-volatility cryptocurrency for
the express purpose of making payments. The currency is designed to be spent
first and foremost. In order to minimize volatility Eco uses a governance
process to mint new currency (in order to counter deflation) and lock up
currency (to counter inflation).

As described above, the project is composed of 4 major components:

### The Token Implementation
The token implementation provides the code driving our ERC20 and ERC777 tokens,
and the shared balance tracking between them. It takes responsibility for
storing balances for all account holders, transferring funds between accounts,
creating and destroying tokens, and providing the interfaces that token holders
will typically interact with.

### The Policies Framework
The policies framework provides the core contract logic that facilitates
upgradability, and is used to enforce access control and permissions between
contracts.

### The Governance System
The governance system is composed of two parts - currency governance and
network governance. The currency governance aspect allows our trusted nodes to
make decisions about the monetary supply in the economy, and the network
governance component allows stake-holders (anyone with tokens) to make decisions
about changes to contracts (and through them, how the network is managed).

### The VDF Implementation
Eco uses VDFs as a critical component of the currency governance process, and
the VDF implementation provides most of that functionality. It allows
incremental proving of a Verifiable Delay Function, and the demonstration of a
proof to the governance system.

### The Deployment Tooling
The deployment tooling is used to bootstrap the other contracts when first
deployed to an Ethereum network. It includes the functionality necessary to
configure the system, and also provides a faucet and cleanup contracts for use
in testing.

## Install
To use the code you'll need the proper tools. Make sure you have a recent
version of [Node.JS](https://nodejs.org), and a recent version of
[NPM](https://npmjs.com). For some functionality you may also need
[Docker](https://www.docker.com).

Once Node and NPM are installed you can use the `npm` command to install
additional dependencies:
```
npm install
```

## Usage
These contracts are intended for deployment to the Ethereum blockchain. Once
deployed, you can interact with the contracts using the standard Ethereum RPC
mechanisms. The key contract functions are documented in the API sections of
the component README files.

### Running the Linter, Tests and Coverage Report
The commands below provide the basics to get set up developing following our
conventions and standards - all code should pass the linter, all tests should
pass, and code coverage should not decrease. For more information on how to
contribute see the [contributing](#contributing) section or the
[contributors guide](CONTRIBUTING.md).

#### Linting
We use `eslint` and `solhint` to lint the code in this repository. You can run
the linters using:
```
npm run lint
```

#### Testing
You can run the test suite by invoking:
```
npm test
```

The test suite is extensive and can take some time to run - patience is often
required.

#### Coverage Reporting
Coverage reports are generated separated for Solidity and JavaScript code:
```
npm run coverage:js
npm run coverage:sol
```

Or, aliased for convenience when running both:
```
npm run coverage
```

### Runnning a Testnet with Docker
We provide a `Dockerfile` to help run a local testnet for developing clients,
wallets, or even policy updates.

#### Building the Docker Image
You can build the docker image from sources using:
```
docker build -t currency .
```

This will produce an image named `currency` and add it to your local image set.

#### Interacting with the Container
When the docker image runs, a list of pertinent addresses will be displayed on
standard out, including the deployed ERC20 contract address:
```
Root:     0xAD4371ce9D4Bd8100577684F18D416585Ad0EdBC
Policy:   0xF710A0b2D104F30a1b32F398F0CFD404C48AC523
Store:    0x24FffDBcc509205b478ED0ea37c74D56715BD59a
ERC20:    0x24FffDBcc509205b478ED0ea37c74D56715BD59a
ERC777:   0xcf6bfE4E29e06c79Ce8b6A49861CFf62f77A32e2
Voting:   0xf724586058838104d24E3Cf32F21f375DB3Ddcd6
Cleanup:  0xb15BD484bb23dFEC1534d0bA2FDb4827F01Ec1F6
Faucet:   0x356aa04ab1Af60ce46b0822d6a34e6adbb4cb810
```

The container also communicates over the following TCP ports:

 Port | Purpose                                            | Conditions/Flags
----- | -------------------------------------------------- | ----------------
 8545 | A ganache-backed Ethereum RPC service              | Always Available
 8548 | An HTTP service for discovering contract addresses | `--supervise`

#### Running the Docker Image

Run the docker image with:
```
docker run --rm --init -p 8545:8545 -it currency
```

> Docker Run Flags:
> `--rm` delete the container when it exits to free up disk space
> `--init` create an init process inside the container to clean up processes
> `-it` allocate a tty and runs the container with stdin and stdout configured
> `-p` configure port forwarding from the host system to the container
>
> For more details, use `docker run --help` to find documentation.

To pass an account as a trusted node, invoke `docker run` passing the
`trustednodes` flag to the initialization script:
```
docker run --rm --init -p 8545:8545 -it currency --trustednode 0x....,0x....
```

To automatically start the supervisor process to push network changes along,
invoke `docker run` with the flag `--supervise`. This also exposes a server on
port 8548 which responds with the address of the Root Policy object:
```
docker run --rm --init -p 8545:8545 -p 8548:8548 -it currency --supervise
```

## Components
 - [Policy Framework](./contracts/policy)
 - [Deployment Tools & Support Contracts](./contracts/deploy)
 - [Currency Implementation](./contracts/currency)
 - [Inflation & Governance](./contracts/governance)

## Maintainers
Maintained by the engineering team at Eco Network
(eng at eco dot com).

## Contributing
Contributions are welcome. Please submit any issues as issues on GitHub, and
open a pull request with any contributions.

Please ensure that the test suite passes (run `npm test`) and that our linters
run at least as cleanly as they did when you started (run `npm run lint`). Pull
requests that do not pass the test suite, or that produce significant lint
errors will likely not be accepted.

See the [contributing guide](./CONTRIBUTING.md) for more details.

## License
[MIT (c) Eco Network](./LICENSE)
