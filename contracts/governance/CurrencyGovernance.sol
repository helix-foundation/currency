// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./TrustedNodes.sol";
import "../policy/Policy.sol";
import "../policy/PolicedUtils.sol";
import "../currency/EcoBalanceStore.sol";
import "./Inflation.sol";
import "../utils/TimeUtils.sol";
import "../VDF/VDFVerifier.sol";

/** @title Inflation/Deflation Process
 *
 * This contract oversees the currency inflation/deflation process. Trusted
 * nodes vote to create or lock up currency to manage the relative price of
 * Eco tokens.
 */
contract CurrencyGovernance is PolicedUtils, TimeUtils {
    enum Stages {
        Propose,
        Commit,
        Reveal,
        Compute,
        Finished
    }

    Stages public stage;

    struct Proposal {
        bool valid;
        uint256 randomInflationWinners;
        uint256 randomInflationPrize;
        uint256 lockupDuration;
        uint256 lockupInterest;
        uint256 inflationMultiplier;
    }

    uint256 public constant PROPOSAL_TIME = 10 days;
    uint256 public constant VOTING_TIME = 3 days;
    uint256 public constant REVEAL_TIME = 1 days;

    mapping(address => Proposal) public proposals;
    mapping(address => bytes32) public commitments;
    mapping(address => uint256) public score;

    mapping(address => bool) internal voteCheck;

    address public leader;
    address public winner;

    uint256 public proposalEnds;
    uint256 public votingEnds;
    uint256 public revealEnds;

    /** Fired when a vote is revealed, to create a voting history for all
     * participants. Records the voter, as well as all of the parameters of
     * the vote cast.
     */
    event VoteRevealed(address indexed voter, address[] votes);

    /** Fired when vote results are computed, creating a permanent record of
     * vote outcomes.
     */
    event VoteResults(address winner);

    modifier atStage(Stages _stage) {
        updateStage();
        require(stage == _stage, "This call is not allowed at this stage.");
        _;
    }

    function updateStage() public {
        uint256 time = getTime();
        if (stage == Stages.Propose && time >= proposalEnds) {
            stage = Stages.Commit;
        } else if (stage == Stages.Commit && time >= votingEnds) {
            stage = Stages.Reveal;
        } else if (stage == Stages.Reveal && time >= revealEnds) {
            stage = Stages.Compute;
        }
    }

    constructor(address _policy) PolicedUtils(_policy) {}

    /** Restrict access to trusted nodes only.
     */
    modifier onlyTrusted() {
        require(
            getTrustedNodes().isTrusted(msg.sender),
            "Only trusted nodes can call this method"
        );
        _;
    }

    function propose(
        uint256 _randomInflationWinners,
        uint256 _randomInflationPrize,
        uint256 _lockupDuration,
        uint256 _lockupInterest,
        uint256 _inflationMultiplier
    ) external onlyClone onlyTrusted atStage(Stages.Propose) {
        Proposal storage p = proposals[msg.sender];
        p.valid = true;
        p.randomInflationWinners = _randomInflationWinners;
        p.randomInflationPrize = _randomInflationPrize;
        p.lockupDuration = _lockupDuration;
        p.lockupInterest = _lockupInterest;
        p.inflationMultiplier = _inflationMultiplier;
    }

    function unpropose() external onlyClone atStage(Stages.Propose) {
        delete proposals[msg.sender];
    }

    function commit(bytes32 _commitment)
        external
        onlyClone
        onlyTrusted
        atStage(Stages.Commit)
    {
        commitments[msg.sender] = _commitment;
    }

    function reveal(bytes32 _seed, address[] calldata _votes)
        external
        onlyClone
        atStage(Stages.Reveal)
    {
        require(
            commitments[msg.sender] != bytes32(0),
            "No unrevealed commitment exists"
        );
        require(_votes.length > 0, "Cannot vote empty");
        require(
            keccak256(abi.encodePacked(_seed, msg.sender, _votes)) ==
                commitments[msg.sender],
            "Commitment mismatch"
        );

        // remove the trustee's default vote
        score[address(0)] -= 1;

        for (uint256 i = 0; i < _votes.length; ++i) {
            address v = _votes[i];
            require(!voteCheck[v], "Repeated vote");
            require(proposals[v].valid, "Invalid vote");

            voteCheck[v] = true;
            score[v] += _votes.length - i;

            if (score[v] > score[leader]) {
                leader = v;
            }
        }

        for (uint256 i = 0; i < _votes.length; ++i) {
            voteCheck[_votes[i]] = false;
        }

        delete commitments[msg.sender];
        emit VoteRevealed(msg.sender, _votes);
    }

    function compute() external onlyClone atStage(Stages.Compute) {
        winner = leader;
        stage = Stages.Finished;

        emit VoteResults(winner);
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
        proposalEnds = getTime() + PROPOSAL_TIME;
        votingEnds = proposalEnds + VOTING_TIME;
        revealEnds = votingEnds + REVEAL_TIME;

        Proposal storage p = proposals[address(0)];
        p.valid = true;
        // the default values for everything are currently 0

        // sets the default votes for the default proposal
        score[address(0)] = getTrustedNodes().trustedNodesLength();
        leader = address(0);
    }

    /** Get the associated balance store address.
     */
    function getStore() private view returns (EcoBalanceStore) {
        return EcoBalanceStore(policyFor(ID_BALANCESTORE));
    }

    function getTrustedNodes() private view returns (TrustedNodes) {
        return TrustedNodes(policyFor(ID_TRUSTED_NODES));
    }

    function getToken() private view returns (IERC20) {
        return IERC20(policyFor(ID_ERC20TOKEN));
    }
}
