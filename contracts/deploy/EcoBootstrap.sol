/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./EcoInitializable.sol";
import "../proxy/ForwardProxy.sol";

/** @title EcoInitializable holder for bootstrap deployment
 * This allows a single transaction to create 20 contract addresses that can
 * be personalized later, and these addresses will be the same on all
 * networks.
 *
 * This is mostly an optimization to allow using the Nick's method of
 * deployment only once. However, if 20 is not enough, the process can
 * be repeated any number of times, and each execution will yield 20 new
 * addresses.
 */
contract EcoBootstrap is Ownable {
    EcoInitializable[] public placeholders;

    /** @dev Number of placeholder contracts to deploy */
    uint256 internal constant NUM_PLACEHOLDERS = 20;

    /** Reserve new addresses for future use.
     *
     * @param _owner The owner of the reservation contract. Also the only
     *               address permitted to claim reserved addresses.
     */
    constructor(address _owner) public {
        transferOwnership(_owner);
        ForwardTarget init = new EcoInitializable(address(uint160(owner())));

        /* Create 20 uninitialized addresses for future use. 20 is plenty for
         * now, and there is no particular reason why 20 was selected other than
         * to provide ample room for future growth.
         */
        for (uint256 i = 0; i < NUM_PLACEHOLDERS; i++) {
            placeholders.push(
                EcoInitializable(address(new ForwardProxy(init)))
            );
        }
    }

    /** @notice Selfdestruct */
    function destruct() external onlyOwner {
        selfdestruct(address(uint160(owner())));
    }
}
