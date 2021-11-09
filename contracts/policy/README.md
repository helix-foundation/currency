# Eco Policy Contract Framework
> The Eco Policy Framework

The contracts in this directory provide the basis for the Eco Policy Framework.
The Policy Framework ("policies") allow the management of some abstract set of
contracts by an arbitrary oversight process. For example, the Eco Currency is
managed by the Currency Governance and Proposals Process. The Governance Process can
execute arbitrary code in the context of any contract under its management. This
allows recovery from nearly any situation, and when combined with the proxy
framework facilitates contract upgrades (see below for an example). In general,
any use of the policies system should also use the proxy framework.

## Table of Contents
 - [Security](#security)
 - [Background](#background)
 - [Install](#install)
 - [Usage](#usage)
 - [API](#api)
 - [Contributing](#contributing)
 - [License](#license)

## Security
Please note that if the framework isn't initialized properly it may not result
in a secure deployment. Read the notes on `fusedInit` carefully, and consider
security when writing both your deployment process and your policy contracts.

Best practice security also dictates that `fusedInit` should be called
atomically with the deployment of the proxy being initialized as a policy.

## Background
### Framework Components
#### Policed Contracts
Any contract managed by the Policy Framework should extend the Policed contract
(or the PolicedUtils contract, which adds a few minor helper functions).

The core aspect of any policed contract is the `policyCommand` function, which
allows policy contracts (permissioned through the Policy Initialization Process
described below) to execute arbitrary code in the context of the policed
contract. Only authorized policy contracts can call this function, but it
provides full flexibility in what can be done within the managed contract. This
allows arbitrarily complex policy systems to make any changes they deem
necessary in the contracts they oversee.

#### Policy Contracts
Any contract that is part of an oversight process (eg, the Currency Governance
Process) should extend the Policy contract.

Typically there is a root policy contract for any policed contract, with
additional policy contracts fulfilling specialized roles. (eg, in the
Eco Currency Governance Process there is a specialized contract responsible
for overseeing recurring governance processes like inflation votes.)

#### The Policy Initialization Process
A special initialization process is used to create new policy contracts. This
process is designed to work with the proxy framework and the ERC1820
introspection framework to simplify interaction with policy systems. The process
sets up interface implementers in the ERC1820 registry which can be used to
manage privileges within managed contracts or for discovery to allow contracts
to understand where other components are on the network. The `implementation`
address in the proxy contract is also updated to point at proper contract.

### Example Upgrade Process
1. The Eco Currency is deployed in full, including the Governance Process, and
   the Proxy Framework is in use.
2. A problem is identified with one of the currency contracts requiring a code
   change.
3. The updated code is written and deployed, such that it can run in the same
   storage context as the contract it will be replacing.
4. A contract is written that updates the `implementation` storage slot of the
   context it runs in to point at the new contract location.
5. The contract is submitted to the Governance Process as a proposal, to be
   executed in the context of the proxy for the problematic contract.
6. After successful voting, the Governance Process executes the proposal code
   in the proxy contract, effecting the replacement of the old contract code
   with the new code.

### Contracts
The framework is made up of four contracts: one providing the basis for allowing
management of a contract overseen by the framework (`Policed.sol`), one
providing the base functionality for a contract doing management (`Policy.sol`),
one for bootstrapping the framework within a proxied deployment
(`PolicyInit.sol`), and one providing convenience helpers used in many managed
contracts at Eco (`PolicedUtils.sol`).

#### Policed.sol
The Policed contract provides the basic operations needed for a contract that
should be managed by a policy framework.

#### PolicedUtils.Sol
Provides additional convenience functionality on top of `Policed.sol`.

#### Policy.sol
Provides the basic functionality expected of a policy contract.

#### PolicyInit.sol
Additional utilities for installing policy contracts as the target of a proxy
contract, and initial configuration of a policy framework.

##### Note on Empty Arguments
It is possible to pass empty arrays to `fusedInit` when setting up a policy set.
If this is done accidentally it is possible to end up with your policies in an
unrecoverable state, so it's important to take care when initializing a policy
set.

Additionally, if the new policy code location (`_policycode`) is set to the
address of the initialization contract it will be possible to run `fusedInit` a
second time. This could be used to execute a more complex initialization process
but can also introduce security risk if used improperly.

## Install
See the [main README](../../README.md) for installation instructions.

## Usage
In order to build contracts that use the policy framework the entire currency
system should be declared as a dependency. You can import only the contracts
you intend to use.

The framework works best when used in conjunction with the associated Eco
Proxy Framework.

See the [inflation](../inflation) and [currency](../currency) contracts for an
example of usage.

### Framework Initialization
Begin by deploying the `PolicyInit` contract. Then, deploy your root policy
contract. Finally, deploy a proxy (`ForwardProxy`) pointing at the `PolicyInit`
contract and atomically call `fusedInit` on the proxy, passing the address of
your root policy contract as `_policycode`, and any privilege bindings
appropriate.

## API
### Policed
 - Inherits: `ForwardTarget`, `ERC1820ImplementerInterface`

#### policyCommand
Arguments:
 - `_delegate` (address) - the address of contract implementing the command to execute
 - `_data` (bytes) - the parameters to pass to the command contract

Used by the policy hierarchy to implement governance decisions. For example, if
the contract is an ERC20 token then this can be used to arbitrarily update
balances as the result of a governance vote.

##### Security Notes
 - This function can only be called by the root policy in the policy hierarchy
   governing the contract.
 - Anyone able to execute this function can do anything they wish. It provides
   arbitrary code execution in the storage context of the contract. This is
   intentional, but dangerous if not properly protected.
   
### PolicedUtils
 - Inherits: `Policed`, `ERC1820Client`, `CloneFactory`

#### clone
Creates a copy of the contract by deploying a proxy and configuring the contract
as the target of the proxy.
See the [EIP-1167](http://eips.ethereum.org/EIPS/eip-1167) and [clone-factory](https://github.com/optionality/clone-factory) for details.

#### policyFor
Arguments:
 - `_id` (bytes32) - the identifier for a policy contract to look up

Returns the address implementing a particular policy in the governance hierarchy
for this contract. Generally used to write access restrictions for other
functions (eg role-based access control). For example:

```
modifier onlySpecificPolicy() {
  require(
    msg.sender == policyFor(0x......),
    "Only a specific policy is allowed to call this function"
    );
  _;
}
```

### Policy
 - Inherits: `ForwardTarget`, `ERC1820Client`

#### removeSelf
Arguments:
 - `_interfaceIdentifierHash` (bytes32) - the name of the interface to deregister

If the caller (`msg.sender`) is registered in the ERC1820 registry as the
provider of the specified interface for this contract, remove the registration.

##### Security Notes
 - This function can only be used by a contract, because only a contract could
   become registered as an interface provider.
 - Only the registered interface provider can call this function to remove the
   interface provider.

#### policyFor
Arguments:
 - `_id` - the identifier of a policy to find the implementation of

Returns the address of the requested policy implementation.

#### internalCommand
Arguments:
 - `_interfaceIdentifierHash` (bytes32) - the address of the contract expressing the command to execute

This function is used to perform some unspecified operation in the context of
the policy. The provided address must point to a contract providing the
`enacted(address)` interface, which will be invoked using `delegatecall` to
allow it to act on behalf of the policy with all the associated privileges.

##### Security Notes
 - Only a contract providing an interface registered as privileged may call
   this function.
 - Anyone who can call this function, or can control a contract that can call
   this function, can act with impunity within the bounds of the policy
   framework. It is possible to assign new privileges, to change permission
   roles, and take any action that any governance process could trigger. This is
   intentional, but dangerous.

### PolicyInit
 - Inherits: `Policy`

#### fusedInit
Arguments:
 - `_policy` (address) - the address of the root policy contract in a policy hierarchy
 - `_setters` (bytes32[]) - the identifiers for any privileged contracts
 - `_keys` (bytes32[]) - the identifiers for any associated discoverable contracts
 - `_values` (bytes32[]) - the addresses of the discoverable contracts listed in `_keys`
 - `_tokenResolvers` (bytes32[]) - the identifiers of any discoverable contracts that should
   be configured to allow mutual lookup on their own addresses

Review the [Usage](#usage) section for details on the various definitions used
above.

##### Security Notes
 - It is possible to initialize a policy framework multiple times if
   `_policycode` is set to the address of the a `PolicyInit` instance!
 - Passing the 0 address as `_policycode` will break your deployment.
 - If someone else is able to call `fusedInit` before you they can specify any
   policy hierarchy they like, including adding privileges and hiding their
   actions. Make sure your deployment process is atomic.

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md).
