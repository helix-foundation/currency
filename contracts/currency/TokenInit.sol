/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/** @title initial token distribution contract
 *
 * This contract is used to distribute the initial allocations of ECO and ECOx
 */
contract TokenInit is Ownable {
    struct distribution {
        /* The address that will hold the tokens
         */
        address holder;
        /* The balance of tokens to be held by holder
         */
        uint256 balance;
    }

    /** Transfer held tokens for the initial distribution.
     *
     * @param _token The address of the token contract.
     * @param _distributions array of distribution address - balance pairs
     
     */
    function distributeTokens(
        address _token,
        distribution[] calldata _distributions
    ) external onlyOwner {
        // Loops boundaries must be reasonable.
        // This is not an airdrop to all users, but to holding/distribution contracts.
        for (uint256 i = 0; i < _distributions.length; ++i) {
            require(
                ERC20(_token).transfer(
                    _distributions[i].holder,
                    _distributions[i].balance
                ),
                "transfer failed"
            );
        }
    }

    constructor() Ownable() {
        // empty due to inherited constructor
    }
}
