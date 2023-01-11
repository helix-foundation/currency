# Eco Policy Contract Framework
> The Eco Policy Framework

The contracts in this directory provide the basis for the Eco Policy Framework. The Policy Framework ("policies") allow the management of some abstract set of contracts by an arbitrary oversight process. The Policy Framework can execute arbitrary code in the context of any contract under its management through the [Community Governance](../governance/community/README.md) process. This allows recovery from nearly any situation so long as the system itself is not compromised, and when combined with the proxy framework facilitates contract upgrades (see below for an example). In general, any use of the policies system should also use the proxy framework.

## Table of Contents
 - [Security](#security)
 - [Background](#background)
 - [Install](#install)
 - [Usage](#usage)
 - [API](#api)
 - [Contributing](#contributing)
 - [License](#license)

## Security
Please note that if the framework isn't initialized properly it may not result in a secure deployment. Read the notes on `PolicyInit` carefully, and consider security when writing both your deployment process and your policy contracts.

## Background
### Framework Components
#### Policed Contracts
Any contract managed by the Policy Framework should extend the Policed contract (or the PolicedUtils contract, which adds a few minor helper functions).

The core aspect of any policed contract is the `policyCommand` function, which allows policy contracts (permissioned through the Policy Initialization Process described below) to execute arbitrary code in the context of the policed contract. Only authorized policy contracts can call this function, but it provides full flexibility in what can be done within the managed contract. This allows arbitrarily complex policy systems to make any changes they deem necessary in the contracts they oversee.

#### Policy Contracts
Any contract that is part of an oversight process of Policed contracts should extend the Policy contract.

There is a root policy contract for any policed contract, set upon creation, with additional policy contracts fulfilling specialized roles. Any other contracts that are authorized to create policy actions are designated as `setters` in the root policy and must call into that contract to enact changes.

#### The Policy Initialization Process
A special initialization process is used to create new policy contracts. This process is designed to work within the [ERC1820](https://eips.ethereum.org/EIPS/eip-1820) introspection framework to simplify interaction with policy systems. The process sets up interface implementers in the ERC1820 registry which can be used to manage privileges within managed contracts or for discovery to allow contracts to understand where other components are on the network.

### Example Upgrade Process
1. The Eco Currency is deployed in full, including governance.
2. A potential upgrade is identified for one of the proxied currency contracts requiring a code change.
3. The updated code is written and deployed such that it can run in the same storage context as the contract it will be replacing.
4. A proposal contract is written and deployed with a call to `policyCommand` to switch the implementation of the proxy over to the new code.
5. The proposal contract is submitted to Community Governance, to be executed in the context of the proxy for the contract to be upgraded.
6. After successful voting, the Governance Process executes the proposal code in the proxy contracts; switching the proxy to implement the new contract, but retaining the storage context of the old contract.

### Contracts
The framework is made up of four types of contracts: one providing the base functionality for a contract doing management (`Policy.sol`), a parent contract for allowing management of a contract overseen by the framework (`Policed.sol`), one that extends the previous for providing convenient helpers used in many managed contracts at Eco (`PolicedUtils.sol`), and one for bootstrapping the framework within a deployment (`PolicyInit.sol`). All contracts will inherit from `ERC1820Client.sol` which just holds the address and type information on the ERC1820 registry.

#### Policy.sol
Provides the basic functionality expected of a policy contract.

#### Policed.sol
The Policed contract provides the basic operations needed for a contract that should be managed by a policy framework.

#### PolicedUtils.Sol
Provides additional convenience functionality on top of `Policed.sol`.

#### PolicyInit.sol
A one-time-use contract for initial configuration of a policy framework.

## Install
See the [main README](../../README.md) for installation instructions.

## Usage
The framework works best when used in conjunction with proxied contracts to allow for easy upgradability. [ERC1820](https://eips.ethereum.org/EIPS/eip-1820) is a dependency for the system and must exist on your network to use this.

It is possible to pass empty arrays to `fusedInit` when setting up a set of policed contracts. If this is done accidentally you will likely end up with your policies in an unrecoverable state, so it's important to take care when initializing a policy to include all the necessary contracts for initialization.

### Framework Initialization
Begin by deploying the `PolicyInit` contract. Then, deploy your root policy contract and all other contracts you want set with ERC1820 labels. Then deploy a proxy (`ForwardProxy`) pointing at the `PolicyInit` contract. Finally, call `fusedInit` on the proxy, passing the address of your root policy contract as `_policycode`, and any privilege bindings appropriate.

## API
### Policy
 - Inherits: `ForwardTarget`, `ERC1820Client`

This contract is set up to control any number of `Policed` contracts by managing their registration in the ERC1820 registry and sending delegate call commands. It also maintains a mapping of `setters` that designate ERC1820 hash labels that are afforded the priviledge to access these management functions. Any of the `setters` or persons that can control a contract which is a `setter`, can enact whatever they wish within the bounds of the policy framework. It is possible to assign new privileges, to change permission roles, and take any action that any governance process could trigger. This is intentional, but dangerous.

#### removeSelf
Arguments:
 - `_interfaceIdentifierHash` (bytes32) - the hash identifier of the caller's ERC1820 interface

If the caller (`msg.sender`) is registered in the ERC1820 registry for this contract under the specified interface, that registration is removed.

##### Security Notes
 - Only the registered interface provider can call this function to remove the interface provider.
 - This function is to allow a contract to de-permission itself to become inert.

#### policyFor
Arguments:
 - `_interfaceIdentifierHash` (bytes32) - the hash identifier of an ERC1820 interface to find the implementation of

Returns the address of the requested policy implementation. Useable as an external utility, functionally equivalent to the function by the same name on `PolicedUtils.sol`.

#### setPolicy
Arguments:
 - `_key` (bytes32) - the hash identifier of an ERC1820 interface to apply to the target
 - `_implementer` (address) - the target address to set as an ERC1820 implemention of `_key`
 - `_authKey` (bytes32) - the hash identifier of the calling contract for lookup purposes

Calls to the ERC1820 registry to set the `_implementer` address to have the label `_key`.

##### Security Notes
 - This function can only be called by a `setter` contract.
 - The setter contract must provide it's ERC1820 label as the `_authKey` parameter for easy lookup
 - `_authKey` is first checked to see if it is, in fact, a label permissioned in `setters` and then it is checked to see if it actually is the label of the `msg.sender`.

#### internalCommand
Arguments:
 - `_delegate` (address) - the address of the contract expressing the command to execute
 - `_authKey` (bytes32) - the hash identifier of the calling contract for lookup purposes

This function is used to perform some unspecified operation in the context of the policy. The provided address must point to a contract providing the `enacted(address)` interface, which will be invoked using `delegatecall` to allow it to act on behalf of the policy with all the associated privileges.

##### Security Notes
 - This function can only be called by a `setter` contract.
 - The setter contract must provide it's ERC1820 label as the `_authKey` parameter for easy lookup
 - `_authKey` is first checked to see if it is, in fact, a label permissioned in `setters` and then it is checked to see if it actually is the label of the `msg.sender`.

### Policed
 - Inherits: `ForwardTarget`, `ERC1820ImplementerInterface`

This contract's contstructor saves the address of the associated `Policy` contract as an immutable value and sets that address as its manager within the ERC1820 registry. Many of the powers of the `Policy` contract come through the functions this contract affords to that address. This contract is abstract and is intended to be inherited by all the contracts in the policy framework.

#### canImplementInterfaceForAddress
Arguments:
 - (bytes32) - unused input by the ERC1820 registry
 - `_addr` (address) - the address of the ERC1820 registry manager (in this case, this is the policy contract)

Is present to be compliant with the ERC1820 registry. Must return `ERC1820_ACCEPT_MAGIC` in the case where the `Policy` contract is `_addr` and revert otherwise. This is a check by the registry before setting a label for the contract. No contracts use the label (the unused input) to make their decision, they always defer to the `Policy` contract.

#### policyCommand
Arguments:
 - `_delegate` (address) - the address of contract implementing the command to execute
 - `_data` (bytes) - the parameters to pass to the command contract

Used by the policy hierarchy to implement governance decisions. For example, if the contract is an ERC20 token then this can be used to arbitrarily update balances as the result of a governance vote. The `_delegate` contract has to contain a function that can correctly act upon the storage of the `Policed` contract being called.

##### Security Notes
 - This function can only be called by the root policy governing the contract.
 - Anyone able to execute this function can do anything they wish to this contract. It provides arbitrary code execution in the storage context of the contract. This is intentional, but dangerous if not properly protected.
   
### PolicedUtils
 - Inherits: `Policed`, `ERC1820Client`, `CloneFactory`

A child contract of `Policed`, intended only to add additional utilities, including ECO-specific lookups for the hash identifiers that are used with ERC1820.

#### canImplementInterfaceForAddress
Arguments:
 - (bytes32) - unused input by the ERC1820 registry
 - `_addr` (address) - the address of the ERC1820 registry manager (in this case, this is the policy contract)

Overrides the function from `Policed` to also allow for the manager to match `expectedInterfaceSet` in the case of needing a temporary controlling address for the contract.

#### setExpectedInterfaceSet
Arguments:
 - `_addr` (address) - the address to set as `expectedInterfaceSet`

Set the `expectedInterfaceSet` to allow for that address to be able to set labels for this contract.

##### Security Notes
 - Can only be called by the policy contract.
 - Should be used to give temporary privileges. Frequent changes to the ERC1820 registration of a contract can result in unstable behavior.

#### clone
Arguments: none

Creates a copy of the contract by deploying a proxy and configuring the contract as the target of the proxy. See the [EIP-1167](http://eips.ethereum.org/EIPS/eip-1167) and [clone-factory](https://github.com/optionality/clone-factory) for details on the proxy contract itself. Clones are for reused functionality that need their own storage to be particularly configured and for contracts that would be expensive to reset to their initial state after use. Calls the `initialize` function on the new contract right after cloning.

##### Security Notes
 - Will revert if called on a clone or other proxy.
 - Anyone can call this, so the clone should only matter if it is funded or if it is given an ERC1820 or somehow otherwise registered as permissioned.

#### policyFor
Arguments:
 - `_id` (bytes32) - the identifier for a policy contract to look up

Returns the address implementing a particular policy in the governance hierarchy for this contract. Generally used to write access restrictions for other functions (eg role-based access control). For example:

```
modifier onlySpecificPolicy() {
  require(
    msg.sender == policyFor(0x......),
    "Only a specific policy is allowed to call this function"
    );
  _;
}
```

### PolicyInit
 - Inherits: `Policy`

This contract masquerades as a `Policy` contract in the storage of a proxy, but has an additional function (`fusedInit`) to set up the ERC1820 framework for the contracts in the initial deploy as well as populate the list of `setters`. After `fusedInit` is called, it will no longer be the implementer of the proxy.

#### fusedInit
Arguments:
 - `_policy` (address) - the address of the root policy contract in a policy hierarchy
 - `_setters` (bytes32[]) - the identifiers for any privileged contracts
 - `_keys` (bytes32[]) - the identifiers for any associated discoverable contracts
 - `_values` (address[]) - the addresses of the discoverable contracts listed in `_keys`

This function assumes the contract is proxied and won't work as expected if it is not. It sets `_policy` as the implementer of the proxy.

Then it goes through the arrays `_keys` and `_values` and sets the first element of `_values` to have the first element of `_keys` as its label in the ERC1820 registry for this (the root policy) address, then the second in `_values` to the second in `_keys` and so forth. All contracts in the initial deploy that need to have labels assigned must be in these arrays. Both arrays must have the same length as they are matched one to one.

Finally, it saves the hash labels in `_setters` to the mapping for the policy contract. These should be a subset of `_keys` to function as they need to recognize this label with the policy as its manager in the ERC1820 registry. These are contracts with significant privileges, so assign them sparingly.

##### Security Notes
 - Passing the 0 address as `_policy` will break your deployment.
 - Passing empty lists for `_keys` and `_values` will almost assuredly break your deployment.
 - The contract is `Ownable`, owned by its deployer. The function `fusedInit` can only be called by the owner.

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md).
