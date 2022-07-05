// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

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

    struct Cohort {
        /** The list of trusted nodes in the cohort*/
        address[] trustedNodes;
        /** @dev address of trusted node to index in trustedNodes */
        mapping(address => uint256) trusteeNumbers;
    }

    /** cohort number */
    uint256 public cohort;

    /** cohort number to cohort */
    mapping(uint256 => Cohort) internal cohorts;

    /** Represents the number of votes for which the trustee can claim rewards.
    Increments each time the trustee votes, set to zero upon redemption */
    mapping(address => uint256) public votingRecord;

    /** reward earned per completed and revealed vote */
    uint256 public voteReward;

    /** Event emitted when a node added to a list of trusted nodes.
     */
    event TrustedNodeAddition(address indexed node);

    /** Event emitted when a node removed from a list of trusted nodes
     */
    event TrustedNodeRemoval(address indexed node);

    /** Event emitted when a trustee redeems their voting rewards */
    event VotingRewardRedemption(address indexed trustee, uint256 amount);

    /** Creates a new trusted node registry, populated with some initial nodes.
     */
    constructor(
        Policy _policy,
        address[] memory _initialTrustedNodes,
        uint256 _voteReward
    ) PolicedUtils(_policy) {
        voteReward = _voteReward;

        _trust(address(0));
        for (uint256 i = 0; i < _initialTrustedNodes.length; ++i) {
            _trust(_initialTrustedNodes[i]);
        }
    }

    /** Initialize the storage context using parameters copied from the
     * original contract (provided as _self).
     *
     * Can only be called once, during proxy initialization.
     *
     * @param _self The original contract address.
     */
    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        // vote reward is left as mutable for easier governance
        voteReward = TrustedNodes(_self).voteReward();

        uint256 _numTrustees = TrustedNodes(_self).numTrustees();
        uint256 _cohort = TrustedNodes(_self).cohort();

        for (uint256 i = 0; i <= _numTrustees; ++i) {
            _trust(TrustedNodes(_self).getTrustedNodeFromCohort(_cohort, i));
        }
    }

    function getTrustedNodeFromCohort(uint256 _cohort, uint256 _indexInCohort)
        public
        view
        returns (address trustee)
    {
        return cohorts[_cohort].trustedNodes[_indexInCohort];
    }

    /** Grant trust to a node.
     *
     * The node is pushed to trustedNodes array.
     *
     * @param _node The node to start trusting.
     */
    function trust(address _node) external onlyPolicy {
        _trust(_node);
        emit TrustedNodeAddition(_node);
    }

    /** Stop trusting a node.
     *
     * Node to distrust swaped to be a last element in the trustedNodes, then deleted
     *
     * @param _node The node to stop trusting.
     */
    function distrust(address _node) external onlyPolicy {
        require(
            cohorts[cohort].trusteeNumbers[_node] > 0,
            "Node already not trusted"
        );

        uint256 oldIndex = cohorts[cohort].trusteeNumbers[_node];
        uint256 lastIndex = cohorts[cohort].trustedNodes.length - 1;

        delete cohorts[cohort].trusteeNumbers[_node];

        if (oldIndex != lastIndex) {
            address lastNode = cohorts[cohort].trustedNodes[lastIndex];

            cohorts[cohort].trustedNodes[oldIndex] = lastNode;
            cohorts[cohort].trusteeNumbers[lastNode] = oldIndex;
        }

        delete cohorts[cohort].trustedNodes[lastIndex];
        cohorts[cohort].trustedNodes.pop();
        emit TrustedNodeRemoval(_node);
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
        // uint256 _reward = _votesRedeemed * voteReward;
        uint256 _reward;
        unchecked {
            _reward = _votesRedeemed * voteReward;
        }
        if (_reward / voteReward != votingRecord[msg.sender]) {
            // overflow
            uint256 redeemedVotes = type(uint256).max / voteReward;
            _reward = voteReward * redeemedVotes;
            votingRecord[msg.sender] -= redeemedVotes;
        } else {
            votingRecord[msg.sender] = 0;
        }
        // votingRecord[msg.sender] = 0;

        require(
            ECOx(policyFor(ID_ECOX)).transfer(msg.sender, _reward),
            "Transfer Failed"
        );
        emit VotingRewardRedemption(msg.sender, _reward);
    }

    /** Return the number of entries in trustedNodes
     * array. As the 0 position of the array is unusuable,
     * you subtract by 1.
     */
    function numTrustees() external view returns (uint256) {
        return cohorts[cohort].trustedNodes.length - 1;
    }

    /** Helper function for adding a node to the trusted set.
     *
     * @param _node The node to add to the trusted set.
     */
    function _trust(address _node) private {
        require(
            cohorts[cohort].trusteeNumbers[_node] == 0,
            "Node is already trusted"
        );

        cohorts[cohort].trusteeNumbers[_node] = cohorts[cohort]
            .trustedNodes
            .length;
        cohorts[cohort].trustedNodes.push(_node);
    }

    function isTrusted(address _node) public view returns (bool) {
        return cohorts[cohort].trusteeNumbers[_node] > 0;
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
