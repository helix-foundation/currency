/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../policy/Policed.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/** @title Destructable
 *
 * An interface for contracts that can be "destructed" to remove them from the chain.
 * Used for cleanup in test environments.
 */
interface Destructable {
    function destruct() external;
}

/** @title EcoTestCleanup
 *
 * A policy object used for cleaning up contracts on testnets.
 */
contract EcoTestCleanup is Policed, Ownable, Destructable {
    /** Construct a cleanup contract.
     *
     * @param _policy The root policy contract in the relevant policy hierarchy.
     */
    // solhint-disable-next-line no-empty-blocks
    constructor(address _policy) Policed(_policy) {}

    /** Instruct a specified contract to destruct itself.
     *
     * This action can only be taken by the owner of the cleanup contract
     * instance.
     *
     * @param _target The contract that should be destructed. Must have a
     *                public nullary destruct function (ie, implement the
     *                Destructable interface).
     */
    function cleanup(address _target) external onlyOwner {
        Destructable(_target).destruct();
    }

    /** Self cleanup operation.
     *
     * Note that destructing this contract will likely make it difficult to
     * cleanup any other contracts managed by the policy hierarchy. This
     * contract should be destructed last.
     *
     * This action can only be taken by the owner of the cleanup contract
     * instance.
     */
    function destruct() external override onlyOwner {
        selfdestruct(payable(msg.sender));
    }
}
