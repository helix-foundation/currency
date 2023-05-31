// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../../policy/Policy.sol";
import "../../../policy/Policed.sol";
import "./Proposal.sol";
import "../../Notifier.sol";

/** @title LockupUpgradeAndNotifier
 * A proposal to update the Lockup implementation
 * Also
 */
contract LockupUpgradeAndNotifier is Policy, Proposal {

    // The address of the Notifier contract
    address public immutable newNotifier;

    // The address of the L1ECOBridge
    address public immutable l1EcoBridge;

    // The data for performing a call to the rebase method on L1ECOBridge
    bytes public immutable rebaseData;

    // The new ID hash for the Notifier
    bytes32 public constant NOTIFIER_ID = keccak256("Notifier");

    // The ID hash for the PolicyVotes contract
    // this is used for cluing in the use of setPolicy
    bytes32 public constant POLICY_VOTES_ID = keccak256("PolicyVotes");

    /** Instantiate a new proposal.
     *
     * @param _notifier The address of the notifier contract
     */
    constructor(
        address _notifier,
        address _l1ECOBridge,
        bytes _rebaseData
    ) {
        newNotifier = _notifier;
        l1EcoBridge = _l1ECOBridge;
        bytes rebaseData = _rebaseData;
    }

    /** The name of the proposal.
     */
    function name() public pure override returns (string memory) {
        return "Upgrade Notifier";
    }

    /** A description of what the proposal does.
     */
    function description() public pure override returns (string memory) {
        return
            "This proposal replaces the old notifier with a new one, then adds to it a transaction that syncs the L2 inflation multiplier to the L1 one";
    }

    /** A URL where more details can be found.
     */
    function url() public pure override returns (string memory) {
        return "blah";
    }

    /** Sets the value of the Lockup implementation on the
     * CurrencyTimer contract to the value on this proposal.
     *
     * This is executed in the storage context of the root policy contract.
     */
    function enacted(address) public override {
        address currentNotifier = policyFor(NOTIFIER_ID);
        uint256 transactionsSize = Notifier(currentNotifier).transactionsSize();
        
        // get existing tx data from notifier, add it to new notifier
        for (uint256 i = 0; i < transactionsSize; i++) {
            Notifier.Transaction tx = Notifier(currentNotifier).transactions(i);
            Notifier(newNotifier).addTransaction(tx.destination, tx.data);
        }
        Notifier(newNotifier).addTransaction(L1BridgeAddress, rebaseData);
        setPolicy(NOTIFIER_ID, newNotifier, POLICY_VOTES_ID);
    }
}
