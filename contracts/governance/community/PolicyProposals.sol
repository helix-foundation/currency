// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../policy/Policy.sol";
import "../../currency/IECO.sol";
import "../../policy/PolicedUtils.sol";
import "./Proposal.sol";
import "./PolicyVotes.sol";
import "./VotingPower.sol";
import "../../utils/TimeUtils.sol";
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
        Proposal proposal;
        /* The amount of tokens staked in support of this proposal.
         */
        uint256 totalStake;
    }

    /* A record of which addresses have already staked in support of each proposal
     */
    mapping(Proposal => mapping(address => bool)) public staked;

    /** The set of proposals under consideration.
     * maps from addresses of proposals to structs containing with info and
     * the staking data (struct defined above)
     */
    mapping(Proposal => Prop) public proposals;

    /** The total number of proposals made.
     */
    uint256 public totalProposals;

    /** A list of the addresses of all proposals made.
     */
    Proposal[] public allProposals;

    /** The duration of the proposal portion of the proposal phase.
     */
    uint256 public constant PROPOSAL_TIME = 9 days + 16 hours;

    /** Whether or not a winning proposal has been selected
     */
    bool public proposalSelected;

    /** Selected proposal awaiting configuration before voting
     */
    Proposal public proposalToConfigure;

    /** The minimum cost to register a proposal.
     */
    uint256 public constant COST_REGISTER = 1000e18;

    /** The amount refunded if a proposal does not get selected.
     */
    uint256 public constant REFUND_IF_LOST = 800e18;

    /** The percentage of total voting power required to push to a vote.
     */
    uint256 public constant SUPPORT_THRESHOLD = 30;

    /** The divisor for the above constant, tracks the digits of precision.
     */
    uint256 public constant SUPPORT_THRESHOLD_DIVISOR = 100;

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
    PolicyVotes public policyVotesImpl;

    /** An event indicating a proposal has been proposed
     *
     * @param proposalAddress The address of the Proposal contract instance that was added
     */
    event Register(address indexed proposer, Proposal indexed proposalAddress);

    /** An event indicating that proposal have been supported by stake.
     *
     * @param proposalAddress The address of the Proposal contract instance that was supported
     */
    event Support(address indexed supporter, Proposal indexed proposalAddress);

    /** An event indicating that support has been removed from a proposal.
     *
     * @param proposalAddress The address of the Proposal contract instance that was unsupported
     */
    event Unsupport(
        address indexed unsupporter,
        Proposal indexed proposalAddress
    );

    /** An event indicating a proposal has reached its support threshold
     *
     * @param proposalAddress The address of the Proposal contract instance.
     */
    event SupportThresholdReached(Proposal indexed proposalAddress);

    /** An event indicating that a proposal has been accepted for voting
     *
     * @param contractAddress The address of the PolicyVotes contract instance.
     */
    event VoteStart(PolicyVotes indexed contractAddress);

    /** An event indicating that proposal fee was partially refunded.
     *
     * @param proposer The address of the proposee which was refunded
     */
    event ProposalRefund(
        address indexed proposer,
        Proposal indexed proposalAddress
    );

    /** Construct a new PolicyProposals instance using the provided supervising
     * policy (root) and supporting contracts.
     *
     * @param _policy The address of the root policy contract.
     * @param _policyvotes The address of the contract that will be cloned to
     *                     oversee the voting phase.
     * @param _ecoAddr The address of the ECO token contract.
     * @param _ecoXAddr The address of the ECOx token contract.
     */
    constructor(
        Policy _policy,
        PolicyVotes _policyvotes,
        ECO _ecoAddr,
        ECOx _ecoXAddr
    ) VotingPower(_policy, _ecoAddr, _ecoXAddr) {
        policyVotesImpl = _policyvotes;
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

        // implementation addresses are left as mutable for easier governance
        policyVotesImpl = PolicyProposals(_self).policyVotesImpl();

        proposalEnds = getTime() + PROPOSAL_TIME;
        blockNumber = block.number - 1;
    }

    /**
     * Returns a paginated response from the proposal addresses array. Trying to return out of bounds
     * page results will return an empty array
     *
     * Parameters:
     *  - _page Start page, must be greater than 0
     *  - _resultsPerPage  Number of results per page
     */
    function getPaginatedProposalAddresses(
        uint256 _page,
        uint256 _resultsPerPage
    ) external view returns (Proposal[] memory) {
        (
            uint256 _startIndex,
            uint256 _loopEnd,
            uint256 _returnLength
        ) = _getPaginationBounds(_page, _resultsPerPage);
        //avoid overflows by returning empty if out of bounds on index
        if (totalProposals == 0 || _startIndex > totalProposals - 1) {
            return new Proposal[](0);
        }

        //paginated proposal array
        Proposal[] memory pageProposals = new Proposal[](_returnLength);

        //index of position in array we are writing to
        uint256 _pageIndex = 0;
        for (_startIndex; _startIndex < _loopEnd; _startIndex++) {
            //prevent accessing overflow in base array
            pageProposals[_pageIndex] = allProposals[_startIndex];
            _pageIndex++;
        }

        return pageProposals;
    }

    /**
     * Returns a paginated response of proposal data. Trying to return out of bounds
     * page results will return an empty array
     *
     * Parameters:
     *  - _page Start page, must be greater than 0
     *  - _resultsPerPage  Number of results per page
     */
    function getPaginatedProposalData(uint256 _page, uint256 _resultsPerPage)
        external
        view
        returns (Prop[] memory)
    {
        (
            uint256 _startIndex,
            uint256 _loopEnd,
            uint256 _returnLength
        ) = _getPaginationBounds(_page, _resultsPerPage);
        //avoid overflows by returning empty if out of bounds on index
        if (totalProposals == 0 || _startIndex > totalProposals - 1) {
            return new Prop[](0);
        }

        //paginated props array
        Prop[] memory propsData = new Prop[](_returnLength);

        //index of position in array we are writing to
        uint256 _pageIndex = 0;
        for (_startIndex; _startIndex < _loopEnd; _startIndex++) {
            propsData[_pageIndex] = proposals[allProposals[_startIndex]];
            _pageIndex++;
        }

        return propsData;
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
    function registerProposal(Proposal _prop) external returns (uint256) {
        require(
            address(_prop) != address(0),
            "The proposal address can't be 0"
        );

        require(
            getTime() < proposalEnds && !proposalSelected,
            "Proposals may no longer be registered because the registration period has ended"
        );

        Prop storage _p = proposals[_prop];

        require(
            address(_p.proposal) == address(0),
            "A proposal may only be registered once"
        );

        // if eco token is paused we can't take proposal fee
        // note that currently refunds can be claimed for failed proposals even if fees were not taken
        if (!ecoToken.paused()) {
            require(
                ecoToken.transferFrom(msg.sender, address(this), COST_REGISTER),
                "The token cost of registration must be approved to transfer prior to calling registerProposal"
            );
        }

        _p.proposal = _prop;
        _p.proposer = msg.sender;

        allProposals.push(_prop);
        totalProposals += 1;

        emit Register(msg.sender, _prop);

        // returns the index of the proposal in the allProposals array
        return totalProposals - 1;
    }

    /** Stake in support of an existing proposal.
     *
     * Can only be called during the staking portion of the proposals phase.
     *
     * Your voting strength is added to the supporting stake of the proposal.
     *
     * @param _prop The proposal to support.
     */
    function support(Proposal _prop) external {
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

        require(
            _amount > 0,
            "In order to support a proposal you must stake a non-zero amount of tokens"
        );

        Prop storage _p = proposals[_prop];

        require(
            address(_p.proposal) != address(0),
            "The supported proposal is not registered"
        );
        require(
            !staked[_p.proposal][msg.sender],
            "You may not stake in support of a proposal twice"
        );

        _p.totalStake = _p.totalStake + _amount;
        staked[_p.proposal][msg.sender] = true;

        emit Support(msg.sender, _prop);

        uint256 _total = totalVotingPower(blockNumber);

        if (
            _p.totalStake >
            (_total * SUPPORT_THRESHOLD) / SUPPORT_THRESHOLD_DIVISOR
        ) {
            emit SupportThresholdReached(_prop);
            proposalSelected = true;
            proposalToConfigure = _prop;
        }
    }

    function unsupport(Proposal _prop) external {
        require(
            policyFor(ID_POLICY_PROPOSALS) == address(this),
            "Proposal contract no longer active"
        );
        require(!proposalSelected, "A proposal has already been selected");
        require(
            getTime() < proposalEnds,
            "Proposals may no longer be supported because the registration period has ended"
        );

        Prop storage _p = proposals[_prop];

        require(
            staked[_p.proposal][msg.sender],
            "You have not staked this proposal"
        );

        uint256 _amount = votingPower(msg.sender, blockNumber);
        _p.totalStake = _p.totalStake - _amount;
        staked[_p.proposal][msg.sender] = false;

        emit Unsupport(msg.sender, _prop);
    }

    /** Remove a proposal from proposals mapping and allProposals array
     * @param _prop The proposal to delete.
     */
    function deleteProposal(Proposal _prop) internal {
        require(totalProposals > 0, "no proposals to delete");

        uint256 proposalIndex = totalProposals;
        for (uint256 i = 0; i < totalProposals; i++) {
            if (address(allProposals[i]) == address(_prop)) {
                proposalIndex = i;
                break;
            }
        }
        require(proposalIndex < totalProposals, "proposal does not exist");

        if (proposalIndex < totalProposals - 1) {
            Proposal lastProposal = allProposals[totalProposals - 1];
            allProposals[proposalIndex] = lastProposal;
        }

        // delete last proposal
        allProposals.pop();
        delete proposals[_prop];
        totalProposals = totalProposals - 1;
    }

    function deployProposalVoting() external {
        require(proposalSelected, "no proposal has been selected");
        require(
            address(proposalToConfigure) != address(0),
            "voting has already been deployed"
        );
        Prop storage votingProp = proposals[proposalToConfigure];
        delete proposalToConfigure;

        PolicyVotes pv = PolicyVotes(policyVotesImpl.clone());
        pv.configure(votingProp.proposal, votingProp.proposer, blockNumber);
        policy.setPolicy(ID_POLICY_VOTES, address(pv), ID_POLICY_PROPOSALS);

        emit VoteStart(pv);

        deleteProposal(votingProp.proposal);
    }

    /** Refund the fee for a proposal that was not selected.
     *
     * Returns a partial refund only, does not work on proposals that are
     * on the ballot for the voting phase, and can only be called after the
     * period is over.
     *
     * @param _prop The proposal to issue a refund for.
     */
    function refund(Proposal _prop) external {
        require(
            (proposalSelected && address(proposalToConfigure) == address(0)) ||
                getTime() > proposalEnds,
            "Refunds may not be distributed until the period is over"
        );

        require(
            address(_prop) != address(0),
            "The proposal address can't be 0"
        );

        Prop storage _p = proposals[_prop];
        require(
            _p.proposal == _prop,
            "The provided proposal address is not valid"
        );

        address receiver = _p.proposer;

        deleteProposal(_prop);

        require(ecoToken.transfer(receiver, REFUND_IF_LOST), "Transfer Failed");

        emit ProposalRefund(receiver, _prop);
    }

    /** Reclaim tokens after end time
     * only callable if all proposals are refunded
     */
    function destruct() external {
        require(
            proposalSelected || getTime() > proposalEnds,
            "The destruct operation can only be performed when the period is over"
        );

        require(totalProposals == 0, "Must refund all missed proposals first");

        policy.removeSelf(ID_POLICY_PROPOSALS);

        require(
            ecoToken.transfer(
                address(policy),
                ecoToken.balanceOf(address(this))
            ),
            "Transfer Failed"
        );
    }

    /** Calculates bounds for the propossals array pagination
     */
    function _getPaginationBounds(uint256 _page, uint256 _resultsPerPage)
        internal
        view
        returns (
            uint256 _startIndex,
            uint256 _loopEnd,
            uint256 _returnLength
        )
    {
        require(_page > 0, "Page must be non-zero");

        _startIndex = (_page - 1) * _resultsPerPage;

        //avoid overflows by returning empty if out of bounds on index
        uint256 _totalProposals = totalProposals;
        if (_totalProposals == 0 || _startIndex > _totalProposals - 1) {
            return (_startIndex, _loopEnd, _returnLength);
        }

        uint256 _endIndex = _startIndex + _resultsPerPage;

        //Check bounds at the end of the array to avoid creating a paginated array that has empty values padded on the end
        _returnLength = _endIndex < _totalProposals
            ? _resultsPerPage
            : totalProposals - _startIndex;

        _loopEnd = _startIndex + _returnLength;
    }
}
