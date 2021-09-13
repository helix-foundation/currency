// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../policy/Policy.sol";
import "../currency/EcoBalanceStore.sol";
import "../policy/PolicedUtils.sol";
import "./Proposal.sol";
import "./PolicyVotes.sol";
import "./SimplePolicySetter.sol";
import "./VotingPower.sol";
import "../utils/TimeUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/** @title PolicyProposals
 * `PolicyProposals` oversees the proposals phase of the policy decision
 * process. Proposals can be submitted by anyone willing to lock up funds, and
 * submitted proposals can be supported by anyone willing to stake more than the
 * current supporting stake.
 *
 * First, during the proposals portion of the proposals phase, proposals can be
 * submitted (for a fee). At the end of the proposals portion, the staking
 * portion occurs, during which additional stake may be put up in support of
 * the submitted proposals in order to get them on the ballot in the voting
 * phase.
 *
 * The proposals with the highest stake will make up the ballot during the
 * voting phase.
 */
contract PolicyProposals is VotingPower, TimeUtils {
    using SafeMath for uint256;
    /** A proposal submitted to the process.
     */
    struct Props {
        /* The address of the proposing account.
         */
        address proposer;
        /* The address of the proposal contract.
         */
        address proposal;
        /* The amount of tokens staked in support of this proposal.
         */
        uint256 totalstake;
        /* A record of which addresses have already staked in support of the
         * proposal.
         */
        mapping(address => bool) staked;
    }

    /** The set of proposals under consideration.
     */
    mapping(address => Props) public proposals;

    /** The total number of proposals made.
     */
    uint256 public totalproposals;

    /** A list of all proposals made.
     */
    address[] public allProposals;

    /** The duration of the proposal portion of the proposal phase.
     */
    uint256 public constant PROPOSAL_TIME = 72 hours;

    /** The minimum cost to register a proposal.
     */
    uint256 public constant COST_REGISTER = 1000000000000000000000;

    /** The amount refunded if a proposal does not get selected.
     */
    uint256 public constant REFUND_IF_LOST = 800000000000000000000;

    /** The time at which the proposal portion of the proposals phase ends.
     */
    uint256 public proposalEnds;

    /** The generation of the generational balance store to use for staking in
     * support of a proposal.
     */
    uint256 public generation;

    /** The address of the `PolicyVotes` contract, to be cloned for the voting
     * phase.
     */
    address public policyVotesImpl;

    /** The address of a `SimplePolicySetter` contract used to grant permissions
     * for the voting phase.
     */
    address public simplePolicyImpl;

    /** An event indicating a proposal has been proposed
     *
     * @param proposalAddress The address of the PolicyVotes contract instance.
     */
    event ProposalAdded(address proposer, address proposalAddress);

    /** An event indicating that proposals have been accepted for voting
     *
     * @param contractAddress The address of the PolicyVotes contract instance.
     */
    event VotingStarted(address contractAddress);

    /** An event indicating that proposal have been supported by stake.
     *
     * @param proposalAddress The address of the PolicyVotes contract instance that was supported
     */
    event ProposalSupported(address supporter, address proposalAddress);

    /** An event indicating that proposal fee was partially refunded.
     *
     * @param proposer The address of the proposee which was refunded
     */
    event ProposalRefunded(address proposer);

    /** Construct a new PolicyProposals instance using the provided supervising
     * policy (root) and supporting contracts.
     *
     * @param _policy The root policy contract.
     * @param _policyvotes The address of the contract that will be cloned to
     *                     oversee the voting phase.
     * @param _simplepolicy The address of the `SimplePolicySetter` contract to
     *                      be used in managing permissions.
     */
    constructor(
        address _policy,
        address _policyvotes,
        address _simplepolicy
    ) public VotingPower(_policy) {
        policyVotesImpl = _policyvotes;
        simplePolicyImpl = _simplepolicy;
    }

    /** Initialize the storage context using parameters copied from the original
     * contract (provided as _self).
     *
     * Can only be called once, during proxy initialization.
     *
     * @param _self The original contract address.
     */
    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);

        policyVotesImpl = PolicyProposals(_self).policyVotesImpl();
        simplePolicyImpl = PolicyProposals(_self).simplePolicyImpl();

        proposalEnds = getTime().add(PROPOSAL_TIME);
        generation = getStore().currentGeneration().sub(1);
    }

    /** A list of addresses for all proposed policies
     */
    function allProposalAddresses() public view returns (address[] memory) {
        return allProposals;
    }

    /** Submit a proposal.
     *
     * You must approve the policy proposals contract to withdraw the required
     * fee from your account before calling this.
     *
     * Can only be called during the proposals portion of the proposals phase.
     * Each proposal may only be submitted once.
     *
     * @param _prop The address of the proposal to submit.
     */
    function registerProposal(address _prop) external onlyClone {
        Props storage _p = proposals[_prop];

        require(_prop != address(0), "The proposal address can't be 0");

        require(
            getTime() < proposalEnds,
            "Proposals may no longer be registered because the registration period has ended"
        );
        require(
            _p.proposal == address(0),
            "A proposal may only be registered once"
        );
        require(
            getToken().transferFrom(_msgSender(), address(this), COST_REGISTER),
            "The token cost of registration must be approved to transfer prior to calling registerProposal"
        );

        _p.proposal = _prop;
        _p.proposer = _msgSender();

        allProposals.push(_prop);
        totalproposals = totalproposals.add(1);

        emit ProposalAdded(msg.sender, _prop);
    }

    /** Stake in support of an existing proposal.
     *
     * Can only be called during the staking portion of the proposals phase.
     *
     * You must be able to increase the stake beyond what is currently staked or
     * this function will revert.
     *
     * @param _prop The proposal to support.
     */
    function support(address _prop, uint256[] calldata _lockupGenerations)
        external
    {
        uint256 _amount = votingPower(
            _msgSender(),
            generation,
            _lockupGenerations
        );
        uint256 _total = totalVotingPower(generation);

        Props storage _p = proposals[address(_prop)];

        require(
            policyFor(ID_POLICY_PROPOSALS) == address(this),
            "Proposal contract no longer active"
        );
        require(
            getTime() < proposalEnds,
            "Proposals may no longer be supported because the registration period has ended"
        );
        require(
            _amount > 0,
            "In order to support a proposal you must stake a non-zero amount of tokens"
        );
        require(
            _p.proposal != address(0),
            "The supported proposal is not registered"
        );
        require(
            !_p.staked[_msgSender()],
            "You may not stake in support of a proposal if you have already staked"
        );

        _p.totalstake = _p.totalstake.add(_amount);
        _p.staked[_msgSender()] = true;

        emit ProposalSupported(_msgSender(), _prop);

        if (_p.totalstake > _total.mul(30).div(100)) {
            PolicyVotes pv = PolicyVotes(PolicyVotes(policyVotesImpl).clone());
            pv.configure(address(_prop));

            SimplePolicySetter sps = SimplePolicySetter(
                SimplePolicySetter(simplePolicyImpl).clone(
                    ID_POLICY_VOTES,
                    address(pv)
                )
            );
            Policy(policy).internalCommand(address(sps));
            sps.destruct();

            emit VotingStarted(address(pv));

            delete proposals[address(_prop)];
            totalproposals = totalproposals.sub(1);

            Policy(policy).removeSelf(ID_POLICY_PROPOSALS);
        }
    }

    /** Refund the fee for a proposal that was not selected.
     *
     * Returns a partial refund only, does not work on proposals that are
     * on the ballot for the voting phase, and can only be called after the
     * results have been computed.
     *
     * @param _prop The proposal to issue a refund for.
     */
    function refund(address _prop) external {
        require(
            getTime() > proposalEnds,
            "Refunds may not be distributed until results have been computed"
        );

        require(_prop != address(0), "The proposal address can't be 0");

        Props storage _p = proposals[_prop];
        require(
            _p.proposal == _prop,
            "The provided proposal address is not valid"
        );

        address receiver = _p.proposer;

        delete proposals[_prop];
        totalproposals = totalproposals.sub(1);

        require(
            getToken().transfer(receiver, REFUND_IF_LOST),
            "Transfer failure - unable to issue refund"
        );
        emit ProposalRefunded(receiver);
    }

    /** Remove this contract instance from the chain and free storage.
     */
    function destruct() external onlyClone {
        require(
            getTime() > proposalEnds,
            "The destruct operation can only be performed after results have been computed"
        );

        require(totalproposals == 0, "Must refund all missed proposals first");

        Policy(policy).removeSelf(ID_POLICY_PROPOSALS);

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
