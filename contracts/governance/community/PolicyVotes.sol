// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../policy/Policy.sol";
import "./Proposal.sol";
import "../../policy/PolicedUtils.sol";
import "../../utils/TimeUtils.sol";
import "./VotingPower.sol";
import "../../currency/ECO.sol";
import "../../currency/ECOx.sol";

/** @title PolicyVotes
 * This implements the voting and implementation phases of the policy decision process.
 * Open stake based voting is used for the voting phase.
 */
contract PolicyVotes is VotingPower, TimeUtils {
    /** The proposal being voted on */
    Proposal public proposal;

    /** Per voter power.
     */
    mapping(address => uint256) public stake;

    /** Per voter that votes yes, by amount voted yes
     */
    mapping(address => uint256) public yesVotes;

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

    /** Event emitted when vote is submitted.
     */
    event PolicyVoteCast(address indexed voter, bool vote, uint256 amount);

    /** Event emitted when split vote is.
     */
    event PolicySplitVoteCast(
        address indexed voter,
        uint256 votesYes,
        uint256 votesNo
    );

    /** The store block number to use when checking account balances for staking.
     */
    uint256 public blockNumber;

    // solhint-disable-next-line no-empty-blocks
    constructor(
        Policy _policy,
        ECO _ecoAddr,
        ECOx _ecoXAddr
    ) VotingPower(_policy, _ecoAddr, _ecoXAddr) {}

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
            "Voters must have held tokens before this voting cycle"
        );

        uint256 _oldStake = stake[msg.sender];
        uint256 _oldYesVotes = yesVotes[msg.sender];
        bool _prevVote = _oldYesVotes != 0;

        if (_oldStake != 0) {
            require(
                _prevVote != _vote || _oldStake != _oldYesVotes,
                "Your vote has already been recorded"
            );

            if (_prevVote) {
                yesStake = yesStake - _oldYesVotes;
                yesVotes[msg.sender] = 0;
            }
        }

        if (_vote) {
            yesStake = yesStake + _amount;
            yesVotes[msg.sender] = _amount;
        }

        stake[msg.sender] = _amount;
        totalStake = totalStake + _amount - _oldStake;

        recordVote(msg.sender);
        emit PolicyVoteCast(msg.sender, _vote, _amount);
    }

    /** Submit a mixed vote of yes/no support
     *
     * Useful for contracts that wish to vote for an agregate of users
     *
     * Note As not voting is not equivalent to voting no it matters recording the no votes
     * The total amount of votes in favor is relevant for early enaction and the total percentage
     * of voting power that voted is necessary for determining a winner.
     *
     * Note As this is designed for contracts, the onus is on the contract designer to correctly
     * understand and take responsibility for its input parameters. The only check is to stop
     * someone from voting with more power than they have.
     *
     * @param _votesYes The amount of votes in favor of the proposal
     * @param _votesNo The amount of votes against the proposal
     */
    function voteSplit(uint256 _votesYes, uint256 _votesNo) external {
        require(
            getTime() < voteEnds,
            "Votes can only be recorded during the voting period"
        );

        uint256 _amount = votingPower(msg.sender, blockNumber);

        require(
            _amount > 0,
            "Voters must have held tokens before this voting cycle"
        );

        uint256 _totalVotes = _votesYes + _votesNo;

        require(
            _amount >= _totalVotes,
            "Your voting power is less than submitted yes + no votes"
        );

        uint256 _oldStake = stake[msg.sender];
        uint256 _oldYesVotes = yesVotes[msg.sender];

        if (_oldYesVotes > 0) {
            yesStake = yesStake - _oldYesVotes;
        }

        yesVotes[msg.sender] = _votesYes;
        yesStake = yesStake + _votesYes;

        stake[msg.sender] = _totalVotes;
        totalStake = totalStake + _totalVotes - _oldStake;

        recordVote(msg.sender);
        emit PolicySplitVoteCast(msg.sender, _votesYes, _votesNo);
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
    function configure(Proposal _proposal, uint256 _cutoffBlockNumber)
        external
    {
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
            policy.internalCommand(address(proposal));
            _res = Result.Accepted;
        }

        emit VoteCompleted(_res);
        policy.removeSelf(ID_POLICY_VOTES);

        require(
            ecoToken.transfer(
                address(policy),
                ecoToken.balanceOf(address(this))
            ),
            "Transfer Failed"
        );
    }
}