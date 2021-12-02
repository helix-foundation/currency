// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../contracts/governance/SimplePolicySetter.sol";

/** @title SimplePolicyCloner
 * Tests the cloning of a SimplePolicySetter.
 */
contract SimplePolicyCloner {
    /** The address of the clone.
     */
    address public clone;

    /** Instantiate a new cloner contract.
     *
     * @param _key The key to pass to the policy setter on initialization.
     * @param _value The value to pass to the policy setter on initialization.
     */
    constructor(bytes32 _key, address _value) {
        clone = new SimplePolicySetter().clone(_key, _value);
    }
}
