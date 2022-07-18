// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../policy/PolicedUtils.sol";
import "../../currency/ECOx.sol";

/** @title TrustedNodes
 *
 * A registry of trusted nodes. Trusted nodes are able to vote during
 * inflation/deflation votes, and can only be added or removed using policy
 * proposals.
 *
 */
contract TrustedNodes is PolicedUtils {

    uint256 constant private DAY = 3600 * 24;
    uint256 constant private GENERATION = 14 * DAY;
    uint256 constant private YEAR = 365 * DAY;

    uint256 public yearEnd;

    address public hoard;

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

    mapping(address => uint32[]) public votingTimestamps;

    /** reward earned per completed and revealed vote */
    uint256 public voteReward;

    uint256 public unallocatedRewardsCount;

    /** Event emitted when a node added to a list of trusted nodes.
     */
    event TrustedNodeAddition(address indexed node, uint256 cohort);

    /** Event emitted when a node removed from a list of trusted nodes
     */
    event TrustedNodeRemoval(address indexed node, uint256 cohort);

    /** Event emitted when voting rewards are redeemed */
    event VotingRewardRedemption(address indexed recipient, uint256 amount);

    event RewardsTrackingUpdate(uint256 nextUpdateTimestamp, uint256 newRewardsCount);

    /** Creates a new trusted node registry, populated with some initial nodes.
     */
    constructor(
        Policy _policy,
        address[] memory _initialTrustedNodes,
        uint256 _voteReward
    ) PolicedUtils(_policy) {
        voteReward = _voteReward;
        uint256 trusteeCount = _initialTrustedNodes.length;

        for (uint256 i = 0; i < trusteeCount; ++i) {
            _trust(_initialTrustedNodes[i]);
            emit TrustedNodeAddition(_initialTrustedNodes[i], cohort);
        }

        unallocatedRewardsCount = trusteeCount * (YEAR / GENERATION + 1);
        yearEnd = block.timestamp + YEAR;

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

        for (uint256 i = 0; i < _numTrustees; ++i) {
            _trust(TrustedNodes(_self).getTrustedNodeFromCohort(_cohort, i));
        }
    }

    function getTrustedNodeFromCohort(uint256 _cohort, uint256 _trusteeNumber)
        public
        view
        returns (address trustee)
    {
        return cohorts[_cohort].trustedNodes[_trusteeNumber];
    }

    /** Grant trust to a node.
     *
     * The node is pushed to trustedNodes array.
     *
     * @param _node The node to start trusting.
     */
    function trust(address _node) external onlyPolicy {
        _trust(_node);
    }

    /** Stop trusting a node.
     *
     * Node to distrust swaped to be a last element in the trustedNodes, then deleted
     *
     * @param _node The node to stop trusting.
     */
    function distrust(address _node) external onlyPolicy {
        Cohort storage currentCohort = cohorts[cohort];
        uint256 trusteeNumber = currentCohort.trusteeNumbers[_node];
        require(trusteeNumber > 0, "Node already not trusted");

        uint256 lastIndex = currentCohort.trustedNodes.length - 1;

        delete currentCohort.trusteeNumbers[_node];

        uint256 trusteeIndex = trusteeNumber - 1;
        if (trusteeIndex != lastIndex) {
            address lastNode = currentCohort.trustedNodes[lastIndex];

            currentCohort.trustedNodes[trusteeIndex] = lastNode;
            currentCohort.trusteeNumbers[lastNode] = trusteeNumber;
        }

        // delete currentCohort.trustedNodes[lastIndex];
        currentCohort.trustedNodes.pop();
        emit TrustedNodeRemoval(_node, cohort);
    }

    /** Incements the counter when the trustee reveals their vote
     * only callable by the CurrencyGovernance contract
     */
    function recordVote(address _who) external {
        require(
            msg.sender == policyFor(ID_CURRENCY_GOVERNANCE),
            "Must be the monetary policy contract to call"
        );

        // votingRecord[_who]++;
        votingTimestamps[_who].push(uint32(block.timestamp));
        unallocatedRewardsCount -= 1;
    }

    function redeemVoteRewards() external {

        // TODO: binary search through reveal timestamp array

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

    /** Return the number of entries in trustedNodes array.
     */
    function numTrustees() external view returns (uint256) {
        return cohorts[cohort].trustedNodes.length;
    }

    /** Helper function for adding a node to the trusted set.
     *
     * @param _node The node to add to the trusted set.
     */
    function _trust(address _node) private {
        Cohort storage currentCohort = cohorts[cohort];
        require(
            currentCohort.trusteeNumbers[_node] == 0,
            "Node is already trusted"
        );
        // trustee number of new node is len(trustedNodes) + 1, since we dont want an actual trustee with trusteeNumber = 0
        currentCohort.trusteeNumbers[_node] =
            currentCohort.trustedNodes.length +
            1;
        currentCohort.trustedNodes.push(_node);
        emit TrustedNodeAddition(_node, cohort);
    }

    function isTrusted(address _node) public view returns (bool) {
        return cohorts[cohort].trusteeNumbers[_node] > 0;
    }

    /** Function for adding a new cohort of trustees
     * used for implementing the results of a trustee election
     */
    function newCohort(address[] memory _newCohort) external onlyPolicy {
        cohort++;

        for (uint256 i = 0; i < _newCohort.length; ++i) {
            _trust(_newCohort[i]);
            emit TrustedNodeAddition(_newCohort[i], cohort);
        }
    }

    function annualUpdate() external {
        require(block.timestamp > yearEnd,
            "cannot call this until the current year term has ended"
        );

        uint256 reward = unallocatedRewardsCount * voteReward;
        unallocatedRewardsCount = cohorts[cohort].trustedNodes.length * (YEAR / GENERATION - 1);
        yearEnd = block.timestamp + YEAR;

        ECOx ecoX = ECOx(policyFor(ID_ECOX));

        require(
            ecoX.balanceOf(address(this)) >= unallocatedRewardsCount + reward,
            "Transfer the appropriate funds to this contract before updating"
        );

        require(
            ecoX.transfer(msg.sender, reward),
            "Transfer Failed"
        );

        emit VotingRewardRedemption(hoard, reward);
        emit RewardsTrackingUpdate(yearEnd, unallocatedRewardsCount);
    }
}
