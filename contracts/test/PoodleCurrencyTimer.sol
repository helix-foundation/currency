// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../policy/PolicedUtils.sol";
import "../policy/Policed.sol";
import "../governance/IGenerationIncrease.sol";
import "../governance/monetary/ILockups.sol";
import "../governance/monetary/Lockup.sol";
import "../governance/monetary/CurrencyGovernance.sol";
import "../governance/CurrencyTimer.sol";

/** @title TimedPolicies
 * Oversees the time-based recurring processes that allow governance of the
 * Eco currency.
 */
contract PoodleCurrencyTimer is CurrencyTimer {
    // this is to fulfil inheretence, the values are unused
    constructor()
        CurrencyTimer(
            Policy(address(0)),
            CurrencyGovernance(address(0)),
            RandomInflation(address(0)),
            Lockup(address(0)),
            ECO(address(0))
        )
    {}

    /** Function for changing the address of the governance contract for subsequent generations
     *
     * This is executed in the storage context of the CurrencyTimer contract by the proposal.
     *
     * @param _newBordaImpl The address of the new governance template contract.
     */
    function setBordaImpl(CurrencyGovernance _newBordaImpl) public {
        bordaImpl = _newBordaImpl;
    }
}
