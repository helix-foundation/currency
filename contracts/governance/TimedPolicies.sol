// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../policy/PolicedUtils.sol";
import "../policy/Policy.sol";
import "./SimplePolicySetter.sol";
import "../utils/TimeUtils.sol";
import "./ITimeNotifier.sol";
import "./IGeneration.sol";

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
    uint256 public internalGeneration;
    uint256 public nextGenerationStart;
    bytes32[] public notificationHashes;

    function getNotificationHashesLength() external view returns (uint256) {
        return notificationHashes.length;
    }

    /** The on-chain address for the policy proposal process contract. The
     * contract is cloned for every policy decision process.
     */
    address public policyProposalImpl;

    /** The on-chain address of a policy permission management contract. The
     * contract is cloned, initialized, executed, and destroyed every time
     * policy permissions need to be modified.
     *
     * See `internalCommand` in the policy framework for additional details.
     */
    address public simplePolicyImpl;

    /** An event indicating that a policy decision process has started. The
     * address included indicates where on chain the relevant contract can be
     * found. This event is emitted by `startPolicyProposals` to indicate that
     * a new decision process has started, and to help track historical vote
     * contracts.
     *
     * @param contractAddress The address of the PolicyProposals contract.
     */
    event PolicyDecisionStarted(address contractAddress);

    constructor(
        address _policy,
        address _policyproposal,
        address _simplepolicy,
        bytes32[] memory _notificationHashes
    ) PolicedUtils(_policy) {
        policyProposalImpl = _policyproposal;
        simplePolicyImpl = _simplepolicy;
        internalGeneration = GENERATION_START;
        notificationHashes = _notificationHashes;
    }

    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        policyProposalImpl = TimedPolicies(_self).policyProposalImpl();
        simplePolicyImpl = TimedPolicies(_self).simplePolicyImpl();
        internalGeneration = TimedPolicies(_self).internalGeneration();
        for (
            uint256 i = 0;
            i < TimedPolicies(_self).getNotificationHashesLength();
            ++i
        ) {
            notificationHashes.push(TimedPolicies(_self).notificationHashes(i));
        }
    }

    function incrementGeneration() external {
        require(
            getTime() > nextGenerationStart,
            "Cannot update the generation counter so soon; please try later"
        );

        nextGenerationStart = getTime() + GENERATION_DURATION;
        internalGeneration++;

        for (uint256 i = 0; i < notificationHashes.length; ++i) {
            ITimeNotifier notifier = ITimeNotifier(
                Policy(policy).policyFor(notificationHashes[i])
            );
            require(address(notifier) != address(0), "Broken state");
            notifier.notifyGenerationIncrease();
        }

        startPolicyProposal();
    }

    function generation() external view override returns (uint256) {
        return internalGeneration;
    }

    /** Begin a policies decision process.
     *
     * The proposals contract specified by `policyProposalImpl` is cloned and
     * granted the necessary permissions to run a policies decision process.
     *
     * The decision process begins immediately.
     *
     * Use `policyFor(ID_POLICY_PROPOSALS)` to find the resulting contract
     * address, or watch for the PolicyDecisionStarted event.
     */
    function startPolicyProposal() internal {
        address _proposals = PolicedUtils(policyProposalImpl).clone();
        SimplePolicySetter sps = SimplePolicySetter(
            SimplePolicySetter(simplePolicyImpl).clone(
                ID_POLICY_PROPOSALS,
                _proposals
            )
        );
        Policy(policy).internalCommand(address(sps));
        sps.destruct();
        emit PolicyDecisionStarted(_proposals);
    }
}
