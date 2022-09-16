// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../policy/PolicedUtils.sol";
import "../policy/Policy.sol";
import "../utils/TimeUtils.sol";
import "./IGenerationIncrease.sol";
import "./IGeneration.sol";
import "./community/PolicyProposals.sol";
import "../currency/ECO.sol";
import "../currency/ECOx.sol";

/** @title TimedPolicies
 * Oversees the time-based recurring processes that allow governance of the
 * Eco currency.
 */
contract TimedPolicies is PolicedUtils, TimeUtils, IGeneration {
    // Stores the current generation
    uint256 public override generation;
    // Stores when the next generation is allowed to start
    uint256 public nextGenerationWindowOpen;
    // Stores all contracts that need a function called on generation increase
    bytes32[] public notificationHashes;

    /** The on-chain address for the policy proposal process contract. The
     * contract is cloned for every policy decision process.
     */
    PolicyProposals public policyProposalImpl;

    /**
     * An event indicating that a new generation has started.
     *
     * @param generation The generation number for the new generation.
     */
    event NewGeneration(uint256 indexed generation);

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
        require(
            address(_policyproposal) != address(0),
            "Unrecoverable: do not set the _policyproposal as the zero address"
        );
        require(
            _notificationHashes.length > 0,
            "Unrecoverable: must set _notificationHashes"
        );
        policyProposalImpl = _policyproposal;
        generation = GENERATION_START;
        notificationHashes = _notificationHashes;
    }

    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        // implementations are left mutable for easier governance
        policyProposalImpl = TimedPolicies(_self).policyProposalImpl();

        generation = TimedPolicies(_self).generation();
        notificationHashes = TimedPolicies(_self).getNotificationHashes();
    }

    function getNotificationHashes() public view returns (bytes32[] memory) {
        return notificationHashes;
    }

    function incrementGeneration() external {
        uint256 time = getTime();
        require(
            time >= nextGenerationWindowOpen,
            "Cannot update the generation counter so soon"
        );

        nextGenerationWindowOpen = time + MIN_GENERATION_DURATION;
        generation++;

        CurrencyGovernance bg = CurrencyGovernance(
            policyFor(ID_CURRENCY_GOVERNANCE)
        );

        uint256 _numberOfRecipients;
        uint256 _randomInflationReward;

        if (address(bg) != address(0)) {
            address winner = bg.winner();
            if (winner != address(0)) {
                (_numberOfRecipients, _randomInflationReward, , , , ) = bg
                    .proposals(winner);
            }
        }

        uint256 mintedOnGenerationIncrease = _numberOfRecipients *
            _randomInflationReward;

        uint256 notificationHashesLength = notificationHashes.length;
        for (uint256 i = 0; i < notificationHashesLength; ++i) {
            IGenerationIncrease notified = IGenerationIncrease(
                policy.policyFor(notificationHashes[i])
            );
            if (address(notified) != address(0)) {
                notified.notifyGenerationIncrease();
            }
        }

        startPolicyProposal(mintedOnGenerationIncrease);

        emit NewGeneration(generation);
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
    function startPolicyProposal(uint256 _mintedOnGenerationIncrease) internal {
        PolicyProposals _proposals = PolicyProposals(
            policyProposalImpl.clone()
        );

        // snapshot the ECOx total
        uint256 totalx = ECOx(policyFor(ID_ECOX)).totalSupply();

        _proposals.configure(totalx, _mintedOnGenerationIncrease);
        policy.setPolicy(
            ID_POLICY_PROPOSALS,
            address(_proposals),
            ID_TIMED_POLICIES
        );
        emit PolicyDecisionStart(address(_proposals));
    }
}
