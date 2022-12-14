// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../policy/PolicedUtils.sol";
import "../governance/monetary/Lockup.sol";

/** @title Cloner
 *
 * A test contract that clones the given contract and provides a reference to
 * it.
 */
contract Cloner {
    /** The address of the cloned contract.
     */
    address public clone;

    /** Construct a new contract and clone the provided contract.
     *
     * @param _addr The address of the contract to clone.
     */
    constructor(address _addr) {
        clone = PolicedUtils(_addr).clone();
    }
}
