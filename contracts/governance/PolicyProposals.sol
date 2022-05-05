// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../policy/Policy.sol";
import "../currency/IECO.sol";
import "../policy/PolicedUtils.sol";
import "./Proposal.sol";
import "./PolicyVotes.sol";
import "./SimplePolicySetter.sol";
import "./VotingPower.sol";
import "../utils/TimeUtils.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/** @title PolicyProposals
 * `PolicyProposals` oversees the proposals phase of the policy decision
 * process. Proposals can be submitted by anyone willing to put forth funds, and
 * submitted proposals can be supported by anyone
 *
 * First, during the proposals portion of the proposals phase, proposals can be
 * submitted (for a fee). This is parallelized with a signal voting process where
 * support can be distributed and redistributed to proposals after they are submitted.
 *
 * A proposal that makes it to support above 30% of the total possible support ends this
 * phase and starts a vote.
 */
contract PolicyProposals is VotingPower, TimeUtils {
    /** A proposal submitted to the process.
     */
    struct Prop {
        /* The address of the proposing account.
         */
        address proposer;
        /* The address of the proposal contract.
         */
        address proposal;
        /* The amount of tokens staked in support of this proposal.
         */
        uint256 totalstake;
    }

    /* A record of which addresses have already staked in support of each proposal
     */
    mapping(address => mapping(address => bool)) public staked;

    /** The set of proposals under consideration.
     * maps from addresses of proposals to structs containing with info and
     * the staking data (struct defined above)
     */
    mapping(address => Prop) public proposals;

    /** The total number of proposals made.
     */
    uint256 public totalproposals;

    /** A list of the addresses of all proposals made.
     */
    address[] public allProposals;

    /** The duration of the proposal portion of the proposal phase.
     */
    uint256 public constant PROPOSAL_TIME = 10 days;

    /** Whether or not a winning proposal has been selected
     */
    bool public proposalSelected;

    /** selected proposal awaiting configuration before voting
     */
    address public proposalToConfigure;

    /** The minimum cost to register a proposal.
     */
    uint256 public constant COST_REGISTER = 1000000000000000000000;

    /** The amount refunded if a proposal does not get selected.
     */
    uint256 public constant REFUND_IF_LOST = 800000000000000000000;

    /** The time at which the proposal portion of the proposals phase ends.
     */
    uint256 public proposalEnds;

    /** The block number of the balance stores to use for staking in
     * support of a proposal.
     */
    uint256 public blockNumber;

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

    /** An event indicating that proposal have been supported by stake.
     *
     * @param proposalAddress The address of the PolicyVotes contract instance that was supported
     */
    event ProposalSupported(address supporter, address proposalAddress);

    /** An event indicating that support has been removed from a proposal.
     *
     * @param proposalAddress The address of the PolicyVotes contract instance that was supported
     */
    event ProposalUnsupported(address unsupporter, address proposalAddress);

    /** An event indicating a proposal has reached its support threshold
     *
     * @param proposalAddress The address of the PolicyVotes contract instance.
     */
    event SupportThresholdReached(address proposalAddress);

    /** An event indicating that proposals have been accepted for voting
     *
     * @param contractAddress The address of the PolicyVotes contract instance.
     */
    event VotingStarted(address contractAddress);

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
    ) VotingPower(_policy) {
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

        proposalEnds = getTime() + PROPOSAL_TIME;
        blockNumber = block.number;
    }

    /** A list of addresses for all proposed policies
     */
    function allProposalAddresses() public view returns (address[] memory) {
        return allProposals;
    }

    /** A list of all proposed policies
     */
    function allProposalData() public view returns (Prop[] memory) {
        Prop[] memory proposalData = new Prop[](totalproposals);
        for (uint256 index = 0; index < totalproposals; index++) {
            proposalData[index] = proposals[allProposals[index]];
        }

        return proposalData;
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
    function registerProposal(address _prop) external {
        Prop storage _p = proposals[_prop];

        require(_prop != address(0), "The proposal address can't be 0");

        require(
            getTime() < proposalEnds && !proposalSelected,
            "Proposals may no longer be registered because the registration period has ended"
        );
        require(
            _p.proposal == address(0),
            "A proposal may only be registered once"
        );
        require(
            getToken().transferFrom(msg.sender, address(this), COST_REGISTER),
            "The token cost of registration must be approved to transfer prior to calling registerProposal"
        );

        _p.proposal = _prop;
        _p.proposer = msg.sender;

        allProposals.push(_prop);
        totalproposals = totalproposals + 1;

        emit ProposalAdded(msg.sender, _prop);
    }

    /** Stake in support of an existing proposal.
     *
     * Can only be called during the staking portion of the proposals phase.
     *
     * Your voting strength is added to the supporting stake of the proposal.
     *
     * @param _prop The proposal to support.
     */
    function support(address _prop) external {
        require(
            policyFor(ID_POLICY_PROPOSALS) == address(this),
            "Proposal contract no longer active"
        );
        require(!proposalSelected, "A proposal has already been selected");
        require(
            getTime() < proposalEnds,
            "Proposals may no longer be supported because the registration period has ended"
        );

        uint256 _amount = votingPower(msg.sender, blockNumber);
        uint256 _total = totalVotingPower(blockNumber);

        Prop storage _p = proposals[address(_prop)];

        require(
            _amount > 0,
            "In order to support a proposal you must stake a non-zero amount of tokens"
        );
        require(
            _p.proposal != address(0),
            "The supported proposal is not registered"
        );
        require(
            !staked[_p.proposal][msg.sender],
            "You may not stake in support of a proposal twice"
        );

        _p.totalstake = _p.totalstake + _amount;
        staked[_p.proposal][msg.sender] = true;

        recordVote(msg.sender);
        emit ProposalSupported(msg.sender, _prop);

        if (_p.totalstake > (_total * 30) / 100) {
            emit SupportThresholdReached(_prop);
            proposalSelected = true;
            proposalToConfigure = _prop;
        }
    }

    function unsupport(address _prop) external {
        require(
            policyFor(ID_POLICY_PROPOSALS) == address(this),
            "Proposal contract no longer active"
        );
        require(!proposalSelected, "A proposal has already been selected");
        require(
            getTime() < proposalEnds,
            "Proposals may no longer be supported because the registration period has ended"
        );

        uint256 _amount = votingPower(msg.sender, blockNumber);
        Prop storage _p = proposals[address(_prop)];

        require(
            staked[_p.proposal][msg.sender],
            "You have not staked this proposal"
        );

        _p.totalstake = _p.totalstake - _amount;
        staked[_p.proposal][msg.sender] = false;

        emit ProposalUnsupported(msg.sender, _prop);
    }

    function deployProposalVoting() external {
        require(proposalSelected, "no proposal has been selected");
        require(
            proposalToConfigure != address(0),
            "voting has already been deployed"
        );
        address votingProposal = proposalToConfigure;
        delete proposalToConfigure;

        PolicyVotes pv = PolicyVotes(PolicyVotes(policyVotesImpl).clone());
        pv.configure(address(votingProposal), blockNumber);

        SimplePolicySetter sps = SimplePolicySetter(
            SimplePolicySetter(simplePolicyImpl).clone(
                ID_POLICY_VOTES,
                address(pv)
            )
        );
        Policy(policy).internalCommand(address(sps));

        emit VotingStarted(address(pv));

        delete proposals[address(votingProposal)];
        totalproposals = totalproposals - 1;
    }

    /** Refund the fee for a proposal that was not selected.
     *
     * Returns a partial refund only, does not work on proposals that are
     * on the ballot for the voting phase, and can only be called after the
     * period is over.
     *
     * @param _prop The proposal to issue a refund for.
     */
    function refund(address _prop) external {
        require(
            proposalSelected || getTime() > proposalEnds,
            "Refunds may not be distributed until the period is over"
        );

        require(_prop != address(0), "The proposal address can't be 0");

        Prop storage _p = proposals[_prop];
        require(
            _p.proposal == _prop,
            "The provided proposal address is not valid"
        );

        address receiver = _p.proposer;

        delete proposals[_prop];
        totalproposals = totalproposals - 1;

        require(
            getToken().transfer(receiver, REFUND_IF_LOST),
            "Transfer Failed"
        );

        emit ProposalRefunded(receiver);
    }

    /** Reclaim tokens after end time
     * only callable if all proposals are refunded
     */
    function destruct() external {
        require(
            proposalSelected || getTime() > proposalEnds,
            "The destruct operation can only be performed when the period is over"
        );

        require(totalproposals == 0, "Must refund all missed proposals first");

        Policy(policy).removeSelf(ID_POLICY_PROPOSALS);

        require(
            getToken().transfer(
                address(uint160(policy)),
                getToken().balanceOf(address(this))
            ),
            "Transfer Failed"
        );
    }

    /** Get the associated ERC20 token address.
     */
    function getToken() private view returns (IERC20) {
        return IERC20(policyFor(ID_ECO));
    }
}
