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
    /** The list of trusted nodes.
     */
    address[] public trustedNodes;

    /** An index to determine if a given node is trusted without iterating
     * through the entire list.
     */
    mapping(address => bool) public isTrusted;

    /** @dev Index of trusted node to position in trustedNodes */
    mapping(address => uint256) private trustedNodeIndex;

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
        require(
            isTrusted[_node],
            "Cannot distrust a node that is already not trusted"
        );

        uint256 oldIndex = trustedNodeIndex[_node];
        uint256 lastIndex = trustedNodes.length - 1;

        delete isTrusted[_node];
        delete trustedNodeIndex[_node];

        if (oldIndex != lastIndex) {
            address lastNode = trustedNodes[lastIndex];

            trustedNodes[oldIndex] = lastNode;
            trustedNodeIndex[lastNode] = oldIndex;
        }

        delete trustedNodes[lastIndex];
        trustedNodes.pop();
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

        ECOx(policyFor(ID_ECOX)).transfer(msg.sender, _reward);
        emit VotingRewardRedeemed(msg.sender, _reward);
    }

    /** Return the number of entries in trustedNodes
     * array.
     */
    function trustedNodesLength() external view returns (uint256) {
        return trustedNodes.length;
    }

    /** Helper function for adding a node to the trusted set.
     *
     * @param _node The node to add to the trusted set.
     */
    function _trust(address _node) private {
        require(!isTrusted[_node], "Node is already trusted");

        isTrusted[_node] = true;
        trustedNodeIndex[_node] = trustedNodes.length;
        trustedNodes.push(_node);
    }
}
