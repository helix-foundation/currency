// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../contracts/proxy/ForwardTarget.sol";

/** @title FailingInitializeContract
 *
 * This contract can't be initialized - it reverts whenever an attempt is made.
 * It's used to test the behaviour of EcoInitializable when initialization
 * fails.
 */
contract FailingInitializeContract is ForwardTarget {
    /** Attempt to initialize the contract.
     *
     * This always reverts.
     */
    function initialize(address) public view override onlyConstruction {
        revert("failing as it should");
    }
}
