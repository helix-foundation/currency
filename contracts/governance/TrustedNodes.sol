// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../policy/PolicedUtils.sol";
import "../currency/ECOx.sol";

/** @title TrustedNodes
 *
 * A registry of trusted nodes. Trusted nodes are able to vote during
 * inflation/deflation votes, and can only be added or removed using policy
 * proposals.
 *
 */
contract TrustedNodes is PolicedUtils {
    /** Tracks the current trustee cohort
     * each trustee election cycle corresponds to a new trustee cohort.
     */
    uint256 public cohort;

    /** The list of trusted nodes per cohort.
     */
    mapping(uint256 => address[]) public trustedNodes;

    /** @dev Index of trusted node to position in trustedNodes per cohort */
    mapping(uint256 => mapping(address => uint256)) public trusteeNumber;

    /** Increments each time the trustee votes */
    mapping(address => uint256) public votingRecord;

    uint256 public voteReward;

    /** Event emitted when a node added to a list of trusted nodes.
     */
    event TrustedNodeAdded(address indexed node);

    /** Event emitted when a node removed from a list of trusted nodes
     */
    event TrustedNodeRemoved(address indexed node);

    /** Event emitted when a trustee redeems their voting rewards */
    event VotingRewardRedeemed(address indexed trustee, uint256 amount);

    /** Creates a new trusted node registry, populated with some initial nodes.
     */
    constructor(
        address _policy,
        address[] memory _initial,
        uint256 _voteReward
    ) PolicedUtils(_policy) {
        _trust(address(0));

        for (uint256 i = 0; i < _initial.length; ++i) {
            _trust(_initial[i]);
        }

        voteReward = _voteReward;
    }

    /** Grant trust to a node.
     *
     * The node is pushed to trustedNodes array.
     *
     * @param _node The node to start trusting.
     */
    function trust(address _node) external onlyPolicy {
        _trust(_node);
        emit TrustedNodeAdded(_node);
    }

    /** Stop trusting a node.
     *
     * Node to distrust swaped to be a last element in the trustedNodes, then deleted
     *
     * @param _node The node to stop trusting.
     */
    function distrust(address _node) external onlyPolicy {
        require(trusteeNumber[cohort][_node] > 0, "Node already not trusted");

        uint256 oldIndex = trusteeNumber[cohort][_node];
        uint256 lastIndex = trustedNodes[cohort].length - 1;

        delete trusteeNumber[cohort][_node];

        if (oldIndex != lastIndex) {
            address lastNode = trustedNodes[cohort][lastIndex];

            trustedNodes[cohort][oldIndex] = lastNode;
            trusteeNumber[cohort][lastNode] = oldIndex;
        }

        delete trustedNodes[cohort][lastIndex];
        trustedNodes[cohort].pop();
        emit TrustedNodeRemoved(_node);
    }

    /** Incements the counter when the trustee reveals their vote
     * only callable by the CurrencyGovernance contract
     */
    function recordVote(address _who) external {
        require(
            msg.sender == policyFor(ID_CURRENCY_GOVERNANCE),
            "Must be the monetary policy contract to call"
        );

        votingRecord[_who]++;
    }

    function redeemVoteRewards() external {
        require(votingRecord[msg.sender] > 0, "No rewards to redeem");

        uint256 _votesRedeemed = votingRecord[msg.sender];
        uint256 _reward = _votesRedeemed * voteReward;

        votingRecord[msg.sender] = 0;

        require(
            ECOx(policyFor(ID_ECOX)).transfer(msg.sender, _reward),
            "Transfer Failed"
        );
        emit VotingRewardRedeemed(msg.sender, _reward);
    }

    /** Return the number of entries in trustedNodes
     * array. As the 0 position of the array is unusuable,
     * you subtract by 1.
     */
    function numTrustees() external view returns (uint256) {
        return trustedNodes[cohort].length - 1;
    }

    /** Helper function for adding a node to the trusted set.
     *
     * @param _node The node to add to the trusted set.
     */
    function _trust(address _node) private {
        require(trusteeNumber[cohort][_node] == 0, "Node is already trusted");

        trusteeNumber[cohort][_node] = trustedNodes[cohort].length;
        trustedNodes[cohort].push(_node);
    }

    function isTrusted(address _node) public view returns (bool) {
        return trusteeNumber[cohort][_node] > 0;
    }

    /** Function for adding a new cohort of trustees
     * used for implementing the results of a trustee election
     */
    function newCohort(address[] memory _newCohort) external onlyPolicy {
        cohort++;

        _trust(address(0));

        for (uint256 i = 0; i < _newCohort.length; ++i) {
            _trust(_newCohort[i]);
        }
    }
}
