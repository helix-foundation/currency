// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../policy/Policy.sol";
import "../policy/PolicedUtils.sol";
import "../utils/TimeUtils.sol";
import "./IEcoBalanceStoreGenerationBalance.sol";

/** @title Inflation Root Hash Proposal
 * This implements a root hash proposal contract to be used by the ECO network to
 * establish root hash of merkle tree representing accounts and balances in the system given generation
 *
 * Merkle Tree serves as a mechanism to distribute tickets for Inflationary lottery amongst all accounts in the system
 */
contract InflationRootHashProposal is PolicedUtils, TimeUtils {
    using SafeMath for uint256;

    enum ChallengeStatus {Empty, Pending, Resolved}

    enum RootHashStatus {Pending, Rejected, Accepted}

    struct ChallengeResponse {
        address account;
        uint256 balance;
        uint256 sum;
    }

    struct InflationChallenge {
        bool initialized;
        uint256 challengeEnds;
        uint256 amountOfRequests;
        mapping(uint256 => ChallengeStatus) challengeStatus;
    }

    struct RootHashProposal {
        bool initialized;
        bytes32 rootHash;
        uint256 totalSum;
        uint256 amountOfAccounts;
        uint256 lastLiveChallenge;
        uint256 amountPendingChallenges;
        uint256 totalChallenges;
        uint256 stakedAmount;
        uint256 newChallengerSubmissionEnds;
        RootHashStatus status;
        mapping(address => InflationChallenge) challenges;
        mapping(uint256 => ChallengeResponse) challengeResponses;
        mapping(address => bool) claimed;
    }

    /** The root hash accepted for current generation, set as a final result */
    bytes32 public acceptedRootHash;

    /** The total cumulative sum of the accepted root hash proposal */
    uint256 public acceptedTotalSum;

    /** The total number of accounts in the merkle tree of the accepted root hash proposal */
    uint256 public acceptedAmountOfAccounts;

    /** proposer to proposal data structure. Stores all evaluated proposals */
    mapping(address => RootHashProposal) public rootHashProposals;

    /** Challenger charged with CHALLENGE_FEE ECO every time they challenge proposal */
    uint256 public constant CHALLENGE_FEE = 500e18;

    /** Root hash proposer charged with PROPOSER_FEE ECO for the root hash submission */
    uint256 public constant PROPOSER_FEE = 20000e18;

    /** Initial amount of time given to challengers to submit challenges to new proposal */
    uint256 public constant CHALLENGING_TIME = 1 days;

    /** The time period to collect fees after the root hash was accepted.
     */
    uint256 public constant FEE_COLLECTION_TIME = 180 days;

    /** The timestamp at which the fee collection phase ends and contract might be destructed.
     */
    uint256 public feeCollectionEnds;

    /** merkle tree verified against balances at generation
     */
    uint256 public generation;

    /* Event to be emitted whenever a new challenge to root hash submitted to the contract.
     */
    event RootHashChallengeIndexRequestAdded(
        address indexed proposer,
        bytes32 indexed proposedRootHash,
        address challenger,
        uint256 index
    );

    /* Event to be emitted whenever proposer successfully responded to a challenge
     */
    event ChallengeResponseVerified(
        address indexed proposer,
        bytes32 indexed proposedRootHash,
        address challenger,
        address account,
        uint256 balance,
        uint256 sum,
        uint256 indexed index
    );

    /* Event to be emitted whenever a new root hash proposal submitted to the contract.
     */
    event RootHashProposed(
        address indexed proposer,
        bytes32 indexed proposedRootHash,
        uint256 totalSum,
        uint256 amountOfAccounts
    );

    /* Event to be emitted whenever a root hash proposal rejected.
     */
    event RootHashRejected(
        address indexed proposer,
        bytes32 indexed proposedRootHash
    );

    /* Event to be emitted whenever a root hash proposal accepted.
     */
    event RootHashAccepted(
        address indexed proposer,
        bytes32 indexed proposedRootHash,
        uint256 totalSum,
        uint256 amountOfAccounts
    );

    /* Event to be emitted whenever a missing account claim succeeded. Root hash is rejected.
     */
    event ChallengeMissingAccountSuccess(
        address indexed proposer,
        bytes32 indexed proposedRootHash,
        address challenger,
        address missingAccount
    );

    modifier hashIsNotAcceptedYet() {
        require(
            acceptedRootHash == 0,
            "The root hash accepted, no more actions allowed"
        );
        _;
    }

    modifier challengeConstraintsAreValid(
        address _proposer,
        bytes32 _rootHash,
        address _challenger,
        uint256 _index
    ) {
        RootHashProposal storage proposal = rootHashProposals[_proposer];

        require(
            _proposer != _msgSender(),
            "Root hash proposer can't challenge its own submission"
        );
        require(
            proposal.rootHash == _rootHash,
            "There is no such hash proposal"
        );
        require(
            proposal.status == RootHashStatus.Pending,
            "The proposal is resolved"
        );
        require(
            proposal.amountOfAccounts >= _index,
            "The index have to be within the range of claimed amount of accounts"
        );
        uint256 requestsByChallenger =
            proposal.challenges[_challenger].amountOfRequests;
        if (requestsByChallenger > 2) {
            /* math explanation x - number of request, N - amount of accounts
              condition  -- x < 2 * log( N ) + 2
                            2 ^ x < 2 ^ (2 * log( N ) + 2)
                            2 ^ (x - 2) < (2 ^ log( N )) ^ 2
                            2 ^ ((x - 2)/2) < N
            */

            require(
                2**requestsByChallenger.sub(2).div(2) <
                    proposal.amountOfAccounts,
                "Challenger reached maximum amount of allowed challenges"
            );
        }

        if (!proposal.challenges[_challenger].initialized) {
            require(
                getTime() < proposal.newChallengerSubmissionEnds,
                "Time to submit new challenges is over"
            );
        } else {
            require(
                getTime() < proposal.challenges[_challenger].challengeEnds,
                "Time to submit additional challenges is over"
            );
        }
        _;
    }

    constructor(address _policy) public PolicedUtils(_policy) {}

    /** @notice Configure the inflation root hash proposal contract
     *  which is part of the inflation lottery mechanism
     *
     * @param _generation generation to verify accounts balances against
     */
    function configure(uint256 _generation) external onlyClone {
        require(generation == 0, "This instance has already been configured");
        generation = _generation;
    }

    /** @notice Allows to propose new root hash co
     *  which is part of the inflation lottery mechanism
     *
     * @param _proposedRootHash a root hash of the merkle tree describing all the accounts
     * @param _totalSum total cumulative sum of all the balances in the merkle tree
     * @param _amountOfAccounts total amount of accounts in the tree
     */
    function proposeRootHash(
        bytes32 _proposedRootHash,
        uint256 _totalSum,
        uint256 _amountOfAccounts
    ) external onlyClone hashIsNotAcceptedYet {
        RootHashProposal storage proposal = rootHashProposals[_msgSender()];

        require(!proposal.initialized, "Root hash already proposed");
        require(
            _amountOfAccounts > 0,
            "Hash must consist of at least 1 account"
        );

        proposal.initialized = true;
        proposal.rootHash = _proposedRootHash;
        proposal.totalSum = _totalSum;
        proposal.amountOfAccounts = _amountOfAccounts;
        proposal.newChallengerSubmissionEnds = getTime().add(CHALLENGING_TIME);

        emit RootHashProposed(
            _msgSender(),
            _proposedRootHash,
            _totalSum,
            _amountOfAccounts
        );

        chargeFee(_msgSender(), _msgSender(), PROPOSER_FEE);
    }

    /** @notice Allows to challenge previously proposed root hash.
     *  Challenge requires proposer of the root hash submit proof of the account for requested index
     *
     *  @param _proposer  the roothash proposer address
     *  @param _challengedRootHash  root hash being challenged
     *  @param _index    index in the merkle tree of the account being challenged
     */
    function challengeRootHashRequestAccount(
        address _proposer,
        bytes32 _challengedRootHash,
        uint256 _index
    )
        external
        onlyClone
        hashIsNotAcceptedYet
        challengeConstraintsAreValid(
            _proposer,
            _challengedRootHash,
            _msgSender(),
            _index
        )
    {
        RootHashProposal storage proposal = rootHashProposals[_proposer];

        require(
            _index < proposal.amountOfAccounts,
            "challenged _index have to be within the range of claimed amount of accounts"
        );

        require(
            proposal.challengeResponses[_index].account == address(0),
            "requested index already responded"
        );

        InflationChallenge storage challenge =
            proposal.challenges[_msgSender()];

        if (!challenge.initialized) {
            challenge.initialized = true;
            challenge.challengeEnds = getTime() + 1 days;
            challenge.challengeStatus[_index] = ChallengeStatus.Pending;
        } else {
            require(
                challenge.challengeStatus[_index] == ChallengeStatus.Empty,
                "Index already challenged"
            );
            challenge.challengeStatus[_index] = ChallengeStatus.Pending;
        }
        emit RootHashChallengeIndexRequestAdded(
            _proposer,
            _challengedRootHash,
            _msgSender(),
            _index
        );
        updateCounters(_proposer, _msgSender());

        chargeFee(_msgSender(), _proposer, CHALLENGE_FEE);
    }

    /** @notice A special challenge, the challenger can claim that an account is missing
     *
     * @param _proposer         the roothash proposer address
     * @param _challengedRootHash root hash being challenged
     * @param _index        index in the merkle tree of the account being challenged
     * @param _account      address of the missing account
     */
    function claimMissingAccount(
        address _proposer,
        bytes32 _challengedRootHash,
        uint256 _index,
        address _account
    )
        external
        onlyClone
        hashIsNotAcceptedYet
        challengeConstraintsAreValid(
            _proposer,
            _challengedRootHash,
            _msgSender(),
            _index
        )
    {
        RootHashProposal storage proposal = rootHashProposals[_proposer];

        require(
            getStore().balanceAt(_account, generation) > 0,
            "Missing account does not exist"
        );

        require(
            proposal.challenges[_msgSender()].initialized,
            "Submit Index Request first"
        );

        if (_index != 0) {
            require(
                proposal.challenges[_msgSender()].challengeStatus[_index - 1] ==
                    ChallengeStatus.Resolved,
                "Adjacent _index is not resolved"
            );
            require(
                proposal.challengeResponses[_index - 1].account < _account,
                "Missing account claim failed"
            );
        }
        if (_index != proposal.amountOfAccounts) {
            require(
                proposal.challenges[_msgSender()].challengeStatus[_index] ==
                    ChallengeStatus.Resolved,
                "Adjacent _index is not resolved"
            );
            require(
                _account < proposal.challengeResponses[_index].account,
                "Missing account claim failed"
            );
        }

        emit ChallengeMissingAccountSuccess(
            _proposer,
            _challengedRootHash,
            _msgSender(),
            _account
        );
        rejectRootHash(_proposer, _challengedRootHash);
    }

    /** @notice Allows to proposer of the root hash respond to a challenge of specific index with proof details
     *
     *  @param _rootHash         root hash prove submitted for
     *  @param _challenger       address of the submitter of the challenge
     *  @param _proof            the “other nodes” in the merkle tree.
     *  @param _account          address of an account of challenged index in the tree
     *  @param _claimedBalance   balance of an account of challenged index in the tree
     *  @param _sum              cumulative sum of an account of challenged index in the tree
     *  @param _index            index in the merkle tree being answered
     */
    function respondToChallenge(
        bytes32 _rootHash,
        address _challenger,
        bytes32[] calldata _proof,
        address _account,
        uint256 _claimedBalance,
        uint256 _sum,
        uint256 _index
    ) external onlyClone hashIsNotAcceptedYet {
        RootHashProposal storage proposal = rootHashProposals[_msgSender()];
        InflationChallenge storage challenge = proposal.challenges[_challenger];

        require(
            proposal.rootHash == _rootHash,
            "There is no such hash proposal"
        );

        require(
            getTime() < challenge.challengeEnds,
            "Timeframe to respond to a challenge is over"
        );

        require(
            challenge.challengeStatus[_index] == ChallengeStatus.Pending,
            "There is no pending challenge for this index"
        );

        /* Since the merkle tree includes the index as the hash, it's impossible to give isomorphic answers,
         * so any attempt to answer with a different value than what was used before will fail the merkle check,
         * hence we don't care we rewrite previous answer */

        proposal.challengeResponses[_index].account = _account;
        proposal.challengeResponses[_index].balance = _claimedBalance;
        proposal.challengeResponses[_index].sum = _sum;

        require(
            getStore().balanceAt(_account, generation) == _claimedBalance,
            "Challenge response failed account balance check"
        );

        require(
            verifyMerkleProof(
                _proof,
                _rootHash,
                keccak256(
                    abi.encodePacked(_account, _claimedBalance, _sum, _index)
                )
            ),
            "Challenge response failed merkle tree verification check"
        );

        // Ensure first account starts at 0 cumulative sum
        if (_index == 0) {
            require(
                proposal.challengeResponses[_index].sum == 0,
                "cumulative sum does not starts from 0"
            );
        }

        // Is left neighbor queried, and is it valid?
        if (
            _index != 0 &&
            proposal.challengeResponses[_index - 1].account != address(0)
        ) {
            require(
                proposal.challengeResponses[_index - 1].sum +
                    proposal.challengeResponses[_index - 1].balance ==
                    proposal.challengeResponses[_index].sum,
                "Left neighbor sum verification failed"
            );
            require(
                proposal.challengeResponses[_index - 1].account <
                    proposal.challengeResponses[_index].account,
                "Left neighbor order verification failed"
            );
        }

        // Is right neighbor queried, and is it valid?
        if (
            _index != proposal.amountOfAccounts - 1 &&
            proposal.challengeResponses[_index + 1].account != address(0)
        ) {
            require(
                proposal.challengeResponses[_index].sum +
                    proposal.challengeResponses[_index].balance ==
                    proposal.challengeResponses[_index + 1].sum,
                "Right neighbor sum verification failed"
            );
            require(
                proposal.challengeResponses[_index].account <
                    proposal.challengeResponses[_index + 1].account,
                "Right neighbor order verification failed"
            );
        }

        emit ChallengeResponseVerified(
            _msgSender(),
            _rootHash,
            _challenger,
            _account,
            _claimedBalance,
            _sum,
            _index
        );

        challenge.challengeStatus[_index] = ChallengeStatus.Resolved;
        proposal.amountPendingChallenges = proposal.amountPendingChallenges.sub(
            1
        );
        challenge.challengeEnds = challenge.challengeEnds.add(1 hours);
    }

    /** @notice Checks  root hash proposal. If time is out and there is unanswered challenges proposal is rejected. If time to submit
     *  new challenges is over and there is no unanswered challenges, root hash is accepted.
     *
     *  @param _rootHash    root hash prove submitted for
     *  @param _proposer    the roothash proposer address
     *
     */
    function checkRootHashStatus(address _proposer, bytes32 _rootHash)
        external
        onlyClone
    {
        RootHashProposal storage proposal = rootHashProposals[_proposer];

        if (
            acceptedRootHash == 0 &&
            getTime() > proposal.newChallengerSubmissionEnds &&
            getTime() > proposal.lastLiveChallenge
        ) {
            if (proposal.amountPendingChallenges == 0) {
                acceptRootHash(_proposer, _rootHash);
            } else {
                rejectRootHash(_proposer, _rootHash);
            }
        }

        if (
            acceptedRootHash != 0 && proposal.status == RootHashStatus.Pending
        ) {
            rejectRootHash(_proposer, _rootHash);
        }
    }

    /** @notice Verifies that the account specified is associated with the provided cumulative sum in the approved 
     * Merkle tree for the current generation.
     *
     *  @param _who    address of an account claiming win
     *  @param _proof   the “other nodes” in the merkle tree.
     *  @param _sum     cumulative sum of a claiming account
     *
     */
    function verifyClaimSubmission(
        address _who,
        bytes32[] calldata _proof,
        uint256 _sum,
        uint256 _index
    ) external view onlyClone returns (bool) {
        require(
            acceptedRootHash != 0,
            "Can't claim win before _rootHash established"
        );
        uint256 balance = getStore().balanceAt(_who, generation);
        return
            verifyMerkleProof(
                _proof,
                acceptedRootHash,
                keccak256(abi.encodePacked(_who, balance, _sum, _index))
            );
    }

    /** @notice Allows to claim fee paid as part of challenge or proposal submissions
     *
     *  @param _who        fee recipient
     *  @param _proposer   the roothash proposer address
     *  @param _rootHash   root hash sender claims fee for challenges/proposal
     *
     */
    function claimFeeFor(
        address _who,
        address _proposer,
        bytes32 _rootHash
    ) public onlyClone {
        RootHashProposal storage proposal = rootHashProposals[_proposer];

        require(
            proposal.status != RootHashStatus.Pending,
            "Can't claim _fee on pending _root hash proposal"
        );

        require(!proposal.claimed[_who], "fee already claimed");

        if (_who == _proposer) {
            require(
                proposal.status == RootHashStatus.Accepted ||
                    (proposal.status == RootHashStatus.Rejected &&
                        _rootHash == acceptedRootHash &&
                        proposal.totalSum == acceptedTotalSum &&
                        proposal.amountOfAccounts == acceptedAmountOfAccounts),
                "proposer can't claim fee on not accepted hash"
            );
            getToken().transfer(_who, proposal.stakedAmount);
        } else {
            require(
                proposal.challenges[_who].initialized &&
                    proposal.status == RootHashStatus.Rejected,
                "challenger may claim fee on rejected proposal only"
            );
            uint256 amount =
                proposal.challenges[_who].amountOfRequests.mul(CHALLENGE_FEE);
            amount = amount.add(
                proposal
                    .stakedAmount
                    .mul(proposal.challenges[_msgSender()].amountOfRequests)
                    .div(proposal.totalChallenges)
            );
            getToken().transfer(_who, amount);
        }
        proposal.claimed[_who] = true;
    }

    /** @notice Allows to claim fee paid as part of challenge or proposal submissions
     *          on behalf of the caller (`_msgSender()`).
     *
     *  @param _proposer   the roothash proposer address
     *  @param _rootHash   root hash sender claims fee for challenges/proposal
     *
     */
    function claimFee(address _proposer, bytes32 _rootHash) external onlyClone {
        claimFeeFor(_msgSender(), _proposer, _rootHash);
    }

    /** @notice Self-destructs the inflation root hash proposal contract.
     *
     */
    function destruct() external onlyClone {
        require(
            feeCollectionEnds != 0 && getTime() > feeCollectionEnds,
            "contract might be destructed after fee collection period is over"
        );
        getToken().transfer(
            address(uint160(policy)),
            getToken().balanceOf(address(this))
        );
        selfdestruct(address(uint160(policy)));
    }

    /** @notice updates root hash proposal data structure to mark it rejected
     */
    function rejectRootHash(address _proposer, bytes32 _rootHash) internal {
        rootHashProposals[_proposer].status = RootHashStatus.Rejected;
        emit RootHashRejected(_proposer, _rootHash);
    }

    /** @notice updates root hash proposal data structure  and contract state variables
     *  to mark root hash is accepted
     */
    function acceptRootHash(address _proposer, bytes32 _rootHash) internal {
        RootHashProposal storage proposal = rootHashProposals[_proposer];

        proposal.status = RootHashStatus.Accepted;
        acceptedRootHash = _rootHash;
        acceptedTotalSum = proposal.totalSum;
        acceptedAmountOfAccounts = proposal.amountOfAccounts;
        feeCollectionEnds = getTime() + FEE_COLLECTION_TIME;
        emit RootHashAccepted(
            _proposer,
            _rootHash,
            proposal.totalSum,
            proposal.amountOfAccounts
        );
    }

    /**
     * @dev Returns true if a `_leaf` can be proved to be a part of a Merkle tree
     * defined by `_root`. For this, a `_proof` must be provided, containing
     * sibling hashes on the branch from the _leaf to the _root of the tree. Each
     * pair of leaves and each pair of pre-images are assumed to be sorted.
     * (c) https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/cryptography/MerkleProof.sol
     */
    function verifyMerkleProof(
        bytes32[] memory _proof,
        bytes32 _root,
        bytes32 _leaf
    ) internal pure returns (bool) {
        bytes32 computedHash = _leaf;

        for (uint256 i = 0; i < _proof.length; i++) {
            bytes32 proofElement = _proof[i];
            if (computedHash < proofElement) {
                // Hash(current computed hash + current element of the _proof)
                computedHash = keccak256(
                    abi.encodePacked(computedHash, proofElement)
                );
            } else {
                // Hash(current element of the _proof + current computed hash)
                computedHash = keccak256(
                    abi.encodePacked(proofElement, computedHash)
                );
            }
        }

        // Check if the computed hash (_root) is equal to the provided _root
        return computedHash == bytes32(_root);
    }

    /** @notice increment counter we use to track amount of open challenges etc
     */
    function updateCounters(address _proposer, address _challenger) internal {
        RootHashProposal storage proposal = rootHashProposals[_proposer];
        InflationChallenge storage challenge = proposal.challenges[_challenger];

        proposal.totalChallenges = proposal.totalChallenges.add(1);
        proposal.amountPendingChallenges = proposal.amountPendingChallenges.add(
            1
        );
        challenge.amountOfRequests = challenge.amountOfRequests.add(1);
        challenge.challengeEnds = challenge.challengeEnds.add(1 hours);

        if (proposal.lastLiveChallenge < challenge.challengeEnds) {
            proposal.lastLiveChallenge = challenge.challengeEnds;
        }
    }

    /** @notice charge sender with a fee while updating tracking stake counter
     */
    function chargeFee(
        address _submitter,
        address _proposal,
        uint256 _fee
    ) internal {
        getToken().transferFrom(_submitter, address(this), _fee);
        rootHashProposals[_proposal].stakedAmount = rootHashProposals[_proposal]
            .stakedAmount
            .add(_fee);
    }

    /** @notice Get the associated ERC20 token address.
     */
    function getToken() private view returns (IERC20) {
        return IERC20(policyFor(ID_ERC20TOKEN));
    }

    /** @notice Get the associated balance store address.
     */
    function getStore()
        private
        view
        returns (IEcoBalanceStoreGenerationBalance)
    {
        return IEcoBalanceStoreGenerationBalance(policyFor(ID_BALANCESTORE));
    }
}
