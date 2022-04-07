// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../policy/Policy.sol";
import "../policy/PolicedUtils.sol";
import "../utils/TimeUtils.sol";
import "./VotingPower.sol";

/** @title PolicyVotes
 * This implements the voting and implementation phases of the policy decision process.
 * Open stake based voting is used for the voting phase.
 */
contract PolicyVotes is VotingPower, TimeUtils {
    /** The proposal being voted on */
    address public proposal;

    /** Per voter power.
     */
    mapping(address => uint256) public stake;

    /** Per voter that votes yes
     */
    mapping(address => bool) public yesVote;

    /** Total currency staked in all ongoing votes in basic unit of 10^{-18} ECO (weico).
     */
    uint256 public totalStake;

    /** Total revealed positive stake in basic unit of 10^{-18} ECO (weico).
     */
    uint256 public yesStake;

    /** The length of the commit portion of the voting phase.
     */
    uint256 public constant VOTE_TIME = 3 days;

    /** The delay on a plurality win
     */
    uint256 public constant ENACTION_DELAY = 1 days;

    /** The timestamp at which the commit portion of the voting phase ends.
     */
    uint256 public voteEnds;

    /** Vote result */
    enum Result {
        Accepted,
        Rejected,
        Failed
    }

    /** Event emitted when vote outcome is known.
     */
    event VoteCompleted(Result result);

    /** Event emitted when vote is revealed.
     */
    event PolicyVoteCast(address indexed voter, bool vote, uint256 amount);

    /** The store block number to use when checking account balances for staking.
     */
    uint256 public blockNumber;

    // solhint-disable-next-line no-empty-blocks
    constructor(address _policy) VotingPower(_policy) {}

    /** Submit your yes/no support
     *
     * Shows whether or not your voting power supports or does not support the vote
     *
     * Note Not voting is not equivalent to voting no. Percentage of voted support,
     * not percentage of total voting power is used to determine the win.
     *
     * @param _vote The vote for the proposal
     */
    function vote(bool _vote) external {
        require(
            getTime() < voteEnds,
            "Votes can only be recorded during the voting period"
        );

        uint256 _amount = votingPower(msg.sender, blockNumber);

        require(
            _amount > 0,
            "Voters must have held tokens before the block number of the proposal"
        );

        uint256 _oldStake = stake[msg.sender];
        uint256 _stakeDelta = _amount - _oldStake;

        if (_oldStake != 0) {
            require(
                yesVote[msg.sender] != _vote,
                "Your vote has already been recorded"
            );
            if (yesVote[msg.sender]) {
                yesStake = yesStake - _oldStake;
                yesVote[msg.sender] = false;
            }
        }

        recordVote(msg.sender);
        emit PolicyVoteCast(msg.sender, _vote, _amount);

        if (_vote) {
            yesStake = yesStake + _amount;
            yesVote[msg.sender] = true;
        }
        stake[msg.sender] = _amount;

        totalStake = totalStake + _stakeDelta;
    }

    /** Initialize a cloned/proxied copy of this contract.
     *
     * @param _self The original contract, to provide access to storage data.
     */
    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
    }

    /** Configure the proposals that are part of this voting cycle and start
     * the lockup period.
     *
     * This also fixes the end times of each subsequent phase.
     *
     * This can only be called once, and should be called atomically with
     * instantiation.
     *
     * @param _proposal The proposal to vote on.
     */
    function configure(address _proposal, uint256 _cutoffBlockNumber) external {
        require(voteEnds == 0, "This instance has already been configured");

        voteEnds = getTime() + VOTE_TIME;
        blockNumber = _cutoffBlockNumber;

        proposal = _proposal;
    }

    /** Execute the proposal if it has enough support.
     *
     * Can only be called after the voting and the delay phase,
     * or after the point that more than 50% of the total voting power
     * has voted in favor of the proposal.
     *
     * If the proposal has been accepted, it will be enacted by
     * calling the `enacted` functions using `delegatecall`
     * from the root policy.
     */
    function execute() external {
        uint256 _requiredStake = totalStake / 2;
        uint256 _total = totalVotingPower(blockNumber);
        uint256 _time = getTime();

        Result _res;

        if (yesStake < _total / 2) {
            require(
                _time > voteEnds + ENACTION_DELAY,
                "Majority support required for early enaction"
            );
        }

        require(
            policyFor(ID_POLICY_VOTES) == address(this),
            "This contract no longer has authorization to enact the vote"
        );

        if (totalStake == 0) {
            // Nobody voted
            _res = Result.Failed;
        } else if (yesStake < _requiredStake) {
            // Not enough yes votes
            _res = Result.Rejected;
        } else {
            // Vote passed
            Policy(policy).internalCommand(proposal);
            _res = Result.Accepted;
        }

        emit VoteCompleted(_res);
        Policy(policy).removeSelf(ID_POLICY_VOTES);

        getToken().transfer(
            address(uint160(policy)),
            getToken().balanceOf(address(this))
        );
    }

    /** Get the associated ERC20 token address.
     */
    function getToken() private view returns (IERC20) {
        return IERC20(policyFor(ID_ERC20TOKEN));
    }
}
