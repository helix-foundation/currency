// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../policy/PolicedUtils.sol";
import "../policy/Policy.sol";
import "../utils/TimeUtils.sol";
import "./IGenerationIncrease.sol";
import "./IGeneration.sol";
import "./community/PolicyProposals.sol";

/** @title TimedPolicies
 * Oversees the time-based recurring processes that allow governance of the
 * Eco currency.
 */
contract TimedPolicies is PolicedUtils, TimeUtils, IGeneration {
    /** The minimum number of days between inflation votes.
     */
    uint256 public constant CURRENCY_TIME = 14 days;

    uint256 public constant GENERATION_DURATION = 14 days;
    uint256 private constant GENERATION_START = 1000;
    // Work around the bug in prettier for now
    uint256 public override generation;
    uint256 public nextGenerationStart;
    bytes32[] public notificationHashes;

    /** The on-chain address for the policy proposal process contract. The
     * contract is cloned for every policy decision process.
     */
    PolicyProposals public policyProposalImpl;

    /** An event indicating that a policy decision process has started. The
     * address included indicates where on chain the relevant contract can be
     * found. This event is emitted by `startPolicyProposals` to indicate that
     * a new decision process has started, and to help track historical vote
     * contracts.
     *
     * @param contractAddress The address of the PolicyProposals contract.
     */
    event PolicyDecisionStart(address contractAddress);

    constructor(
        Policy _policy,
        PolicyProposals _policyproposal,
        bytes32[] memory _notificationHashes
    ) PolicedUtils(_policy) {
        policyProposalImpl = _policyproposal;
        generation = GENERATION_START;
        notificationHashes = _notificationHashes;
    }

    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        // implementations are left mutable for easier governance
        policyProposalImpl = TimedPolicies(_self).policyProposalImpl();

        generation = TimedPolicies(_self).generation();
        bytes32[] memory hashes = TimedPolicies(_self).getNotificationHashes();
        for (uint256 i = 0; i < hashes.length; ++i) {
            notificationHashes.push(hashes[i]);
        }
    }

    function getNotificationHashes() public view returns (bytes32[] memory) {
        return notificationHashes;
    }

    function incrementGeneration() external {
        uint256 time = getTime();
        require(
            time > nextGenerationStart,
            "Cannot update the generation counter so soon; please try later"
        );

        nextGenerationStart = time + GENERATION_DURATION;
        generation++;

        uint256 notificationHashesLength = notificationHashes.length;
        for (uint256 i = 0; i < notificationHashesLength; ++i) {
            IGenerationIncrease notified = IGenerationIncrease(
                policy.policyFor(notificationHashes[i])
            );
            // require(address(notifier) != address(0), "Broken state");
            notified.notifyGenerationIncrease();
        }

        startPolicyProposal();
    }

    /** Begin a policies decision process.
     *
     * The proposals contract specified by `policyProposalImpl` is cloned and
     * granted the necessary permissions to run a policies decision process.
     *
     * The decision process begins immediately.
     *
     * Use `policyFor(ID_POLICY_PROPOSALS)` to find the resulting contract
     * address, or watch for the PolicyDecisionStart event.
     */
    function startPolicyProposal() internal {
        PolicyProposals _proposals = PolicyProposals(
            policyProposalImpl.clone()
        );
        policy.setPolicy(ID_POLICY_PROPOSALS, address(_proposals));
        emit PolicyDecisionStart(address(_proposals));
    }
}
