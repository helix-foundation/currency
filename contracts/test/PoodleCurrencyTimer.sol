// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../policy/PolicedUtils.sol";
import "../policy/Policed.sol";
import "../governance/ITimeNotifier.sol";
import "../governance/ILockups.sol";

/** @title TimedPolicies
 * Oversees the time-based recurring processes that allow governance of the
 * Eco currency.
 */
contract PoodleCurrencyTimer is PolicedUtils, ITimeNotifier, ILockups {
    /** The on-chain address for the currency voting contract. This contract is
     * cloned for each new currency vote.
     */
    address public bordaImpl;

    /** These functions are required to exist to implement the contracts that CurrencyTimer
     * inherets from so as to successfully masquerade as CurrencyTimer and run setBordaImpl()
     */
    constructor(address _policy) PolicedUtils(_policy) {}

    function notifyGenerationIncrease() external override {}

    function lockups(uint256) external pure override returns (address) {
        return address(0x0);
    }

    /** Function for changing the address of the governance contract for subsequent generations
     *
     * This is executed in the storage context of the CurrencyTimer contract by the proposal.
     *
     * @param _newBordaImpl The address of the new governance template contract.
     */
    function setBordaImpl(address _newBordaImpl) public {
        bordaImpl = _newBordaImpl;
    }
}
