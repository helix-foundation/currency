// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../policy/Policy.sol";
import "../clone/CloneFactory.sol";

/* @title SimplePolicySetter
 * A simple policy that, when enacted, sets the ERC1820 interface implementation
 * address of the specified interface (_key_) to the specified contract address
 * (_value).
 *
 * The policy framework uses ERC1820 interface mappings to indicate privileges or
 * roles within a policy hierarchy, and TimedPolicies uses this contract
 * extensively to manage the permissions of the one-off vote contracts it
 * creates.
 */
contract SimplePolicySetter is Policy, CloneFactory {
    /** The name of the interface to bind to an address.
     */
    bytes32 public key;

    /** The address of the contract to be bound as an interface implementer.
     */
    address public value;

    /** Set the interface name (_key) and implementation address (_value)
     * to be applied when this policy (contract) is enacted.
     *
     * This can only be called once, and is expected to be called atomically
     * with construction/cloning.
     *
     * @param _key The interface name to set.
     * @param _value The implementation address to set.
     */
    function set(bytes32 _key, address _value) external {
        require(key == bytes32(0), "The key has already been set");
        require(_key != bytes32(0), "The key can't be empty");
        require(value == address(0), "The value has already been set");

        key = _key;
        value = _value;
    }

    /** Create a new clone of this contract, with a new key and value setting.
     *
     * @param _key The interface name to bind.
     * @param _value The implementation address to bind to.
     */
    function clone(bytes32 _key, address _value) external returns (address) {
        address _clone = createClone(address(this));
        SimplePolicySetter(_clone).set(_key, _value);
        return _clone;
    }

    /** Call to enact this policy. Must be run in the context of another
     * policy contract in the Eco policy framework.
     *
     * @param _self The address of the contract to invoke.
     *
     * Remember that local variables are MASKED, since this is from
     * delegatecall
     */
    function enacted(address _self) external {
        SimplePolicySetter _sps = SimplePolicySetter(_self);
        ERC1820REGISTRY.setInterfaceImplementer(
            address(this),
            _sps.key(),
            _sps.value()
        );
    }
}
