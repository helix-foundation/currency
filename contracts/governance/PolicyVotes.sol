// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../policy/Policy.sol";
import "../policy/PolicedUtils.sol";
import "../currency/EcoBalanceStore.sol";
import "../utils/TimeUtils.sol";
import "./VotingPower.sol";

/** @title PolicyVotes
 * This implements the voting and veto phases of the policy decision process.
 * Commit-and-reveal voting is used for the voting phase, and open stake-based
 * voting is used for the veto phase.
 */
contract PolicyVotes is VotingPower, TimeUtils {
    using SafeMath for uint256;
    /** The proposal being voted on */
    address public proposal;

    /** Per voter power.
     */
    mapping(address => uint256) public stake;

    /** Per voter that votes yes
     */
    mapping(address => bool) public yesVote;

    /** Total currency staked in all ongoing votes in basic unit of 10^{-18} (atto) ECO.
     */
    uint256 public totalStake;

    /** Total revealed positive stake in basic unit of 10^{-18} (atto) ECO.
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

    /** The store generation to use when checking account balances for staking.
     */
    uint256 public generation;

    // solhint-disable-next-line no-empty-blocks
    constructor(address _policy) public VotingPower(_policy) {}

    /** Reveal a ballot supporting specific policies.
     *
     * Commit must have been called during the commitment portion of the voting
     * phase, and this can only be called during the reveal portion.
     *
     * Note that not revealing and revealing a no-vote are equivalent for
     * computing the outcome.
     *
     * @param _vote The vote for the proposal
     */
    function vote(bool _vote, uint256[] calldata _lockupGenerations) external {
        require(
            getTime() < voteEnds,
            "Votes can only be recorded during the voting period"
        );

        uint256 _amount = votingPower(
            _msgSender(),
            generation,
            _lockupGenerations
        );

        require(
            _amount > 0,
            "Voters must have held tokens at the start of the generation"
        );

        uint256 _oldStake = stake[_msgSender()];

        if (_oldStake != 0) {
            if (yesVote[_msgSender()]) {
                yesStake = yesStake.sub(_oldStake);
                yesVote[_msgSender()] = false;
            }
            totalStake = totalStake.sub(_oldStake);
            stake[_msgSender()] = 0;
        }

        recordVote(_msgSender());
        emit PolicyVoteCast(_msgSender(), _vote, _amount);

        if (_vote) {
            yesStake = yesStake.add(_amount);
            yesVote[_msgSender()] = true;
        }
        stake[_msgSender()] = _amount;

        totalStake = totalStake.add(_amount);
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
    function configure(address _proposal) external onlyClone {
        require(voteEnds == 0, "This instance has already been configured");

        voteEnds = getTime().add(VOTE_TIME);
        generation = getStore().currentGeneration();

        proposal = _proposal;
    }

    /** Execute the proposal if it has enough support.
     *
     * Can only be called after the reveal phase, and only if the proposal
     * is rejected. Otherwise, must be called after the veto phase.
     * If the proposal has been accepted and not vetoed, it
     * will be enacted by calling the `enacted` functions using `delegatecall`
     * from the root policy.
     */
    function execute() external onlyClone {
        uint256 _requiredStake = totalStake.div(2);
        uint256 _total = totalVotingPower(generation);
        uint256 _time = getTime();

        Result _res;

        if (yesStake <= _total.div(2)) {
            require(
                _time > voteEnds + ENACTION_DELAY,
                "Majority support required for early enaction"
            );
        }

        if (policyFor(ID_POLICY_VOTES) != address(this)) {
            // This contract no longer has authorization to enact the vote
            _res = Result.Failed;
        } else if (_requiredStake == 0) {
            // Nobody voted
            _res = Result.Failed;
        } else if (yesStake <= _requiredStake) {
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

        selfdestruct(address(uint160(policy)));
    }

    /** Get the associated ERC20 token address.
     */
    function getToken() private view returns (IERC20) {
        return IERC20(policyFor(ID_ERC20TOKEN));
    }
}
