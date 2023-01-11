// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../../policy/Policy.sol";
import "../../../policy/Policed.sol";
import "./Proposal.sol";

/** @title LockupUpgradeAndNotifier
 * A proposal to update the Lockup implementation
 * Also
 */
contract LockupUpgradeAndNotifier is Policy, Proposal {
    /** The address of the updated Lockup contract
     */
    address public immutable newLockup;

    /** The address of the Notifier contract
     */
    address public immutable notifier;

    /** The address of the switcher contract for CurrencyTimer
     * This contract has setter functions and the right storage layout
     */
    address public immutable switcherCurrencyTimer;

    /** The address of the switcher contract for TimedPolicies
     * This contract has setter functions and the right storage layout
     */
    address public immutable switcherTimedPolicies;

    // The ID hash for CurrencyTimer
    bytes32 public constant CURRENCY_TIMER_ID = keccak256("CurrencyTimer");

    // The ID hash for TimedPolicies
    bytes32 public constant TIMED_POLICIES_ID = keccak256("TimedPolicies");

    // The new ID hash for the Notifier
    bytes32 public constant NOTIFIER_ID = keccak256("Notifier");

    // The ID hash for the PolicyVotes contract
    // this is used for cluing in the use of setPolicy
    bytes32 public constant POLICY_VOTES_ID = keccak256("PolicyVotes");

    /** Instantiate a new proposal.
     *
     * @param _newLockup The address of the updated Lockup contract
     * @param _notifier The address of the notifier contract
     * @param _switcherCurrencyTimer The address of the switcher contract for CurrencyTimer
     * @param _switcherTimedPolicies The address of the switcher contract for TimedPolicies
     */
    constructor(
        address _newLockup,
        address _notifier,
        address _switcherCurrencyTimer,
        address _switcherTimedPolicies
    ) {
        newLockup = _newLockup;
        notifier = _notifier;
        switcherCurrencyTimer = _switcherCurrencyTimer;
        switcherTimedPolicies = _switcherTimedPolicies;
    }

    /** The name of the proposal.
     */
    function name() public pure override returns (string memory) {
        return "Lockup Upgrade and Notifier";
    }

    /** A description of what the proposal does.
     */
    function description() public pure override returns (string memory) {
        return
            "This proposal patches an issue with the Lockup contract and adds a new contract, the Notifier";
    }

    /** A URL where more details can be found.
     */
    function url() public pure override returns (string memory) {
        return "https://forums.eco.org/t/egp-002-notifier-update-to-lockup/89";
    }

    /** Sets the value of the Lockup implementation on the
     * CurrencyTimer contract to the value on this proposal.
     *
     * This is executed in the storage context of the root policy contract.
     */
    function enacted(address) public override {
        address _currencyTimer = policyFor(CURRENCY_TIMER_ID);
        address _timedPolicies = policyFor(TIMED_POLICIES_ID);

        Policed(_currencyTimer).policyCommand(
            switcherCurrencyTimer,
            abi.encodeWithSignature("setLockupImpl(address)", newLockup)
        );

        setPolicy(NOTIFIER_ID, notifier, POLICY_VOTES_ID);

        Policed(_timedPolicies).policyCommand(
            address(switcherTimedPolicies),
            abi.encodeWithSignature("addNotificationHash(bytes32)", NOTIFIER_ID)
        );
    }
}
