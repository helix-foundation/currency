// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../../policy/Policy.sol";
import "../../../policy/Policed.sol";
import "./Proposal.sol";

/** @title LockupUpgrade
 * A proposal to update the Lockup implementation
 */
contract LockupUpgrade is Policy, Proposal {
    /** The address of the updated Lockup contract
     */
    address public immutable newLockup;

    /** The address of the switcher contract for CurrencyTimer
     * This contract has setter functions and the right storage layout
     */
    address public immutable switcherCurrencyTimer;

    // The ID hash for CurrencyTimer
    bytes32 public constant currencyTimerId = keccak256("CurrencyTimer");

    /** Instantiate a new proposal.
     *
     * @param _newLockup The address of the updated Lockup contract
     */
    constructor(address _newLockup, address _switcherCurrencyTimer) {
        newLockup = _newLockup;
        switcherCurrencyTimer = _switcherCurrencyTimer;
    }

    /** The name of the proposal.
     */
    function name() public pure override returns (string memory) {
        return "";
    }

    /** A description of what the proposal does.
     */
    function description() public pure override returns (string memory) {
        return "";
    }

    /** A URL where more details can be found.
     */
    function url() public pure override returns (string memory) {
        return "";
    }

    /** Sets the value of the Lockup implementation on the
     * CurrencyTimer contract to the value on this proposal.
     *
     * This is executed in the storage context of the root policy contract.
     */
    function enacted(address) public override {
        address _currencyTimer = policyFor(currencyTimerId);

        Policed(_currencyTimer).policyCommand(
            switcherCurrencyTimer,
            abi.encodeWithSignature("setLockupImpl(address)", newLockup)
        );
    }
}
