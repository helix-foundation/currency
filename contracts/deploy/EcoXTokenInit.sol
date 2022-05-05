/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../currency/ECOx.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/** @title ECOx initial token distribution contract
 *
 * This contract is used to distribute the initial allocations of ECOx
 */
contract EcoXTokenInit is Ownable {
    /** Transfer held ECOx for the initial distribution.
     *
     * @param _token The address of the ECOx token contract.
     * @param _initialHolders The addresses to mint to.
     * @param _initialBalances How much to mint to each
     */
    function distributeTokens(
        address _token,
        address[] calldata _initialHolders,
        uint256[] calldata _initialBalances
    ) external onlyOwner {
        require(
            _initialHolders.length == _initialBalances.length,
            "_initialHolders and _initialBalances must correspond exactly (length)"
        );

        // Loops boundaries must be reasonable.
        // This is not an airdrop to all users, but to holding/distribution contracts.
        for (uint256 i = 0; i < _initialHolders.length; ++i) {
            ECOx(_token).transfer(_initialHolders[i], _initialBalances[i]);
        }
    }

    constructor() Ownable() {}
}
