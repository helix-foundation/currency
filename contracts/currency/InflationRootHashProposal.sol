// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../policy/Policy.sol";
import "../policy/PolicedUtils.sol";
import "../utils/TimeUtils.sol";
import "./IECO.sol";

/** @title Inflation Root Hash Proposal
 * This implements a root hash proposal contract to be used by the ECO network to
 * establish root hash of merkle tree representing accounts and balances in the system given generation
 *
 * Merkle Tree serves as a way to fairly establish which addresses can claim the random inflation reward
 */
contract InflationRootHashProposal is PolicedUtils, TimeUtils {
    enum ChallengeStatus {
        Empty,
        Pending,
        Resolved
    }

    enum RootHashStatus {
        Pending,
        Rejected,
        Accepted
    }

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

    /** merkle tree verified against balances at block number
     */
    uint256 public blockNumber;

    /** This array tracks the allowed data in proofs to fill out the empty part of the merkle
     * tree. The first element is the result of a node value with all zero data (see where
     * verifyMerkleProof is called in respondToChallenge for more info on how the data is typed).
     * Each subsequent element after the first is a hashing of two copies of the previous element.
     * These hashes are precomputed to save gas and accomodate up to 2^33 active addresses
     * (minimal upper bound on the world population at time of writing).
     */
    bytes32[34] public ALLOWED_ZERO_DATA = [
        bytes32(
            0x3bdd562417b2b6c29b6c37a0fbf5c08139fe63f7baf013194f112d8319bf8b32
        ),
        bytes32(
            0x422368e34d87bbb713e283dad123fed473e105cb74d37751f74867ab4fa87edd
        ),
        bytes32(
            0xf27703a76b6cfeda85aef5a7207fb15760fdc0a162fd616cf250471474e93064
        ),
        bytes32(
            0xf929785be718729ceabcb86d15bfa39b70c5ca2d430061be1555d41e48651375
        ),
        bytes32(
            0x93786748e00c02a99af4dce47e7ce8ac741000befb5264ea4fb14273b3fc7332
        ),
        bytes32(
            0x95695af3951d243667eb4a8110eafd09a6c323e4a83970ee18a4e417aeab6b46
        ),
        bytes32(
            0xfe8a835cd62790af744e0f74b439a14953a4560b2854ed74e46b7ab3f9d0ec84
        ),
        bytes32(
            0x50b158d1b56319c75fa84bbf35c6be81b74658e52133cf80ce69cf8412676dab
        ),
        bytes32(
            0xf821f04ade470a841f53c946523e8cadc4c3126466c9e360da641d163bf94d45
        ),
        bytes32(
            0x89fcc5a6f1ce62a204c07e25d4be37bb6abcbaae7c3dcef32168f6776d1f3b30
        ),
        bytes32(
            0xe9899ac52db5b000d178480fe653578b5c8298b11226427735f69819af117283
        ),
        bytes32(
            0xcc11d2b08ed3235c9db4f0e81cda57ffbb0a2bce262dd047f1fbec17138fa3a0
        ),
        bytes32(
            0x817ca40addaa46113d0d93c9b4e0a6653ccefd7be164981df4021cb156e581f5
        ),
        bytes32(
            0xf642e9a700a89f0c2376ef3e27096ae0a9aa004aa13c418a43d03f281780bc6c
        ),
        bytes32(
            0xdcc5fb90bdb02900974d26fea2f08bd727dd87bac6feb3092d4d794adce07d7d
        ),
        bytes32(
            0x341922905d8f0ad976a7926d61cd3cefc00f71b4189e996276c3b67248dc56ce
        ),
        bytes32(
            0xa4521c78c157299308a6cf452a7f92e41da1ac1bf410ab669c158c4971289fc3
        ),
        bytes32(
            0xeb5645021221cbbbe4dfe15917f1131fab92ae3f89f4ed22a72f72d0326b6996
        ),
        bytes32(
            0x535cf4c0d87516f7f91f15e22c454a28758315386ceb055143265a8678da8d32
        ),
        bytes32(
            0x867be7d011bbfddc0cf8e84bcaf579161a22ccc1fe31469ecc7d69abd6a4fe44
        ),
        bytes32(
            0x45924a35e31e7b38e729b1d06b5b0362f65054c5173e71ddd8e684b4ccb53010
        ),
        bytes32(
            0x77d7566b9985683b9ce74ac609ea0cbb07033475796e7eac736bf50963a96c63
        ),
        bytes32(
            0xa1860c29c0172e7b4e1841b0be9b94a762f630b069ac198c2b3ade33a6acf4e6
        ),
        bytes32(
            0x92b5f37f2d83c6417e3b750460faf4f4173f3f1f8aada7c55c2aa6694adf9fe9
        ),
        bytes32(
            0x02a9d327f039021e04948268ff66f805007a6c30353d6d5d7996890f35948dac
        ),
        bytes32(
            0xff2e7b675fc1dd7d9b9bf728a034886b6d9e44073b9c1faa096714f435bf684f
        ),
        bytes32(
            0xf00a9c17ce7e52771884528e3f14b513a938fbf66e5166bb108e65a23f4df764
        ),
        bytes32(
            0x554b57844825163cff94995356fa9ef1404e7419c5efa562a2dbdede0348bb67
        ),
        bytes32(
            0x4a24b92759a0746442c5c69457f9e08327b2ba3977f67871107125a7ad3b102c
        ),
        bytes32(
            0xd1a9cf27f8f87d22a0d282846bfbde81777e3d6505b3635945f87181f202daa2
        ),
        bytes32(
            0x81b858655769500c9040590a626665d038664a81554c0ada4f00acb4f16c8771
        ),
        bytes32(
            0x5fcda3026802a31538986984a97b9886b328467ae421c9ed21fe8d8eeb756a64
        ),
        bytes32(
            0x1600b37f0df1767945b7a5ea9541b28ab36d4767f5ded2d3c3a490958747ab57
        ),
        bytes32(
            0x064f2f7cf038f44f2b1959a171d52c7ec4ba817fb2cfa9460676eac90a51e3ab
        )
    ];

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
        address _challenger,
        uint256 _index
    ) {
        RootHashProposal storage proposal = rootHashProposals[_proposer];

        require(
            _proposer != _challenger,
            "Root hash proposer can't challenge its own submission"
        );
        require(
            proposal.rootHash != bytes32(0),
            "There is no such hash proposal"
        );
        require(
            proposal.status == RootHashStatus.Pending,
            "The proposal is resolved"
        );
        require(
            proposal.amountOfAccounts > _index,
            "The index have to be within the range of claimed amount of accounts"
        );
        uint256 requestsByChallenger = proposal
            .challenges[_challenger]
            .amountOfRequests;
        if (requestsByChallenger > 2) {
            /* math explanation x - number of request, N - amount of accounts
              condition  -- x < 2 * log( N ) + 2
                            2 ^ x < 2 ^ (2 * log( N ) + 2)
                            2 ^ (x - 2) < (2 ^ log( N )) ^ 2
                            2 ^ ((x - 2)/2) < N
            */

            require(
                2**(requestsByChallenger - 2) < (proposal.amountOfAccounts)**2,
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

    constructor(address _policy) PolicedUtils(_policy) {}

    /** @notice Configure the inflation root hash proposal contract
     *  which is part of the random inflation mechanism
     *
     * @param _blockNumber block number to verify accounts balances against
     */
    function configure(uint256 _blockNumber) external {
        require(blockNumber == 0, "This instance has already been configured");
        blockNumber = _blockNumber;
    }

    // as you cannot declare a reference type as a constant, memory must be explicitly moved on cloning
    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        ALLOWED_ZERO_DATA = InflationRootHashProposal(_self).allowedZeroData();
    }

    // used to cleanly get the data for the initialize
    function allowedZeroData() public view returns (bytes32[34] memory) {
        return ALLOWED_ZERO_DATA;
    }

    /** @notice Allows to propose new root hash co
     *  which is part of the random inflation mechanism
     *
     * @param _proposedRootHash a root hash of the merkle tree describing all the accounts
     * @param _totalSum total cumulative sum of all the balances in the merkle tree
     * @param _amountOfAccounts total amount of accounts in the tree
     */
    function proposeRootHash(
        bytes32 _proposedRootHash,
        uint256 _totalSum,
        uint256 _amountOfAccounts
    ) external hashIsNotAcceptedYet {
        RootHashProposal storage proposal = rootHashProposals[msg.sender];

        require(!proposal.initialized, "Root hash already proposed");
        require(
            _amountOfAccounts > 0,
            "Hash must consist of at least 1 account"
        );

        proposal.initialized = true;
        proposal.rootHash = _proposedRootHash;
        proposal.totalSum = _totalSum;
        proposal.amountOfAccounts = _amountOfAccounts;
        proposal.newChallengerSubmissionEnds = getTime() + CHALLENGING_TIME;

        emit RootHashProposed(
            msg.sender,
            _proposedRootHash,
            _totalSum,
            _amountOfAccounts
        );

        chargeFee(msg.sender, msg.sender, PROPOSER_FEE);
    }

    /** @notice Allows to challenge previously proposed root hash.
     *  Challenge requires proposer of the root hash submit proof of the account for requested index
     *
     *  @param _proposer  the roothash proposer address
     *  @param _index    index in the merkle tree of the account being challenged
     */
    function challengeRootHashRequestAccount(address _proposer, uint256 _index)
        external
        hashIsNotAcceptedYet
        challengeConstraintsAreValid(_proposer, msg.sender, _index)
    {
        RootHashProposal storage proposal = rootHashProposals[_proposer];

        require(
            proposal.challengeResponses[_index].account == address(0),
            "requested index already responded"
        );

        InflationChallenge storage challenge = proposal.challenges[msg.sender];

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
            proposal.rootHash,
            msg.sender,
            _index
        );
        updateCounters(_proposer, msg.sender);

        chargeFee(msg.sender, _proposer, CHALLENGE_FEE);
    }

    /** @notice A special challenge, the challenger can claim that an account is missing
     *
     * @param _proposer         the roothash proposer address
     * @param _index        index in the merkle tree of the account being challenged
     * @param _account      address of the missing account
     */
    function claimMissingAccount(
        address _proposer,
        uint256 _index,
        address _account
    )
        external
        hashIsNotAcceptedYet
        challengeConstraintsAreValid(_proposer, msg.sender, _index)
    {
        RootHashProposal storage proposal = rootHashProposals[_proposer];

        require(
            getStore().balanceAt(_account, blockNumber) > 0,
            "Missing account does not exist"
        );

        require(
            proposal.challenges[msg.sender].initialized,
            "Submit Index Request first"
        );

        if (_index != 0) {
            require(
                proposal.challenges[msg.sender].challengeStatus[_index - 1] ==
                    ChallengeStatus.Resolved,
                "Left _index is not resolved"
            );
            require(
                proposal.challengeResponses[_index - 1].account < _account,
                "Missing account claim failed"
            );
        }
        if (_index != proposal.amountOfAccounts) {
            require(
                proposal.challenges[msg.sender].challengeStatus[_index] ==
                    ChallengeStatus.Resolved,
                "Right _index is not resolved"
            );
            require(
                _account < proposal.challengeResponses[_index].account,
                "Missing account claim failed"
            );
        }

        emit ChallengeMissingAccountSuccess(
            _proposer,
            proposal.rootHash,
            msg.sender,
            _account
        );
        rejectRootHash(_proposer);
    }

    /** @notice Allows to proposer of the root hash respond to a challenge of specific index with proof details
     *
     *  @param _challenger       address of the submitter of the challenge
     *  @param _proof            the “other nodes” in the merkle tree.
     *  @param _account          address of an account of challenged index in the tree
     *  @param _claimedBalance   balance of an account of challenged index in the tree
     *  @param _sum              cumulative sum of an account of challenged index in the tree
     *  @param _index            index in the merkle tree being answered
     */
    function respondToChallenge(
        address _challenger,
        bytes32[] calldata _proof,
        address _account,
        uint256 _claimedBalance,
        uint256 _sum,
        uint256 _index
    ) external hashIsNotAcceptedYet {
        RootHashProposal storage proposal = rootHashProposals[msg.sender];
        InflationChallenge storage challenge = proposal.challenges[_challenger];

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
            getStore().balanceAt(_account, blockNumber) == _claimedBalance,
            "Challenge response failed account balance check"
        );

        require(
            verifyMerkleProof(
                _proof,
                proposal.rootHash,
                keccak256(
                    abi.encodePacked(_account, _claimedBalance, _sum, _index)
                ),
                _index,
                proposal.amountOfAccounts
            ),
            "Challenge response failed merkle tree verification check"
        );

        // Ensure first account starts at 0 cumulative sum
        if (_index == 0) {
            require(_sum == 0, "cumulative sum does not starts from 0");
        }

        // Ensure final account matches total sum
        if (_index == proposal.amountOfAccounts - 1) {
            require(
                proposal.totalSum == _sum + _claimedBalance,
                "cumulative sum does not match total sum"
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
            msg.sender,
            proposal.rootHash,
            _challenger,
            _account,
            _claimedBalance,
            _sum,
            _index
        );

        challenge.challengeStatus[_index] = ChallengeStatus.Resolved;
        proposal.amountPendingChallenges = proposal.amountPendingChallenges - 1;
        challenge.challengeEnds = challenge.challengeEnds + 1 hours;
    }

    /** @notice Checks  root hash proposal. If time is out and there is unanswered challenges proposal is rejected. If time to submit
     *  new challenges is over and there is no unanswered challenges, root hash is accepted.
     *
     *  @param _proposer    the roothash proposer address
     *
     */
    function checkRootHashStatus(address _proposer) external {
        RootHashProposal storage proposal = rootHashProposals[_proposer];

        if (
            acceptedRootHash == 0 &&
            getTime() > proposal.newChallengerSubmissionEnds &&
            getTime() > proposal.lastLiveChallenge
        ) {
            if (proposal.amountPendingChallenges == 0) {
                acceptRootHash(_proposer);
            } else {
                rejectRootHash(_proposer);
            }
        }

        if (
            acceptedRootHash != 0 && proposal.status == RootHashStatus.Pending
        ) {
            rejectRootHash(_proposer);
        }
    }

    /** @notice Verifies that the account specified is associated with the provided cumulative sum in the approved
     * Merkle tree for the current generation.
     *
     *  @param _who    address of the account attempting to claim
     *  @param _proof   the “other nodes” in the merkle tree.
     *  @param _sum     cumulative sum of a claiming account
     *
     */
    function verifyClaimSubmission(
        address _who,
        bytes32[] calldata _proof,
        uint256 _sum,
        uint256 _index
    ) external view returns (bool) {
        require(
            acceptedRootHash != 0,
            "Can't claim before root hash established"
        );
        uint256 balance = getStore().balanceAt(_who, blockNumber);
        return
            verifyMerkleProof(
                _proof,
                acceptedRootHash,
                keccak256(abi.encodePacked(_who, balance, _sum, _index)),
                _index,
                acceptedAmountOfAccounts
            );
    }

    /** @notice Allows to claim fee paid as part of challenge or proposal submissions
     *
     *  @param _who        fee recipient
     *  @param _proposer   the roothash proposer address
     *
     */
    function claimFeeFor(address _who, address _proposer) public {
        RootHashProposal storage proposal = rootHashProposals[_proposer];

        require(
            proposal.status != RootHashStatus.Pending,
            "Can't claim _fee on pending root hash proposal"
        );

        require(!proposal.claimed[_who], "fee already claimed");

        if (_who == _proposer) {
            require(
                proposal.status == RootHashStatus.Accepted ||
                    (proposal.status == RootHashStatus.Rejected &&
                        proposal.rootHash == acceptedRootHash &&
                        proposal.totalSum == acceptedTotalSum &&
                        proposal.amountOfAccounts == acceptedAmountOfAccounts),
                "proposer can't claim fee on not accepted hash"
            );
            require(
                getToken().transfer(_who, proposal.stakedAmount),
                "Transfer Failed"
            );
        } else {
            require(
                proposal.challenges[_who].initialized &&
                    proposal.status == RootHashStatus.Rejected,
                "challenger may claim fee on rejected proposal only"
            );
            uint256 amount = proposal.challenges[_who].amountOfRequests *
                CHALLENGE_FEE;
            amount =
                amount +
                (proposal.stakedAmount *
                    proposal.challenges[msg.sender].amountOfRequests) /
                proposal.totalChallenges;
            require(getToken().transfer(_who, amount), "Transfer Failed");
        }
        proposal.claimed[_who] = true;
    }

    /** @notice Allows to claim fee paid as part of challenge or proposal submissions
     *          on behalf of the caller (`msg.sender`).
     *
     *  @param _proposer   the roothash proposer address
     *
     */
    function claimFee(address _proposer) external {
        claimFeeFor(msg.sender, _proposer);
    }

    /** @notice Reclaims tokens on the inflation root hash proposal contract.
     *
     */
    function destruct() external {
        require(
            feeCollectionEnds != 0 && getTime() > feeCollectionEnds,
            "contract might be destructed after fee collection period is over"
        );
        require(
            getToken().transfer(
                address(uint160(policy)),
                getToken().balanceOf(address(this))
            ),
            "Transfer Failed"
        );
    }

    /** @notice updates root hash proposal data structure to mark it rejected
     */
    function rejectRootHash(address _proposer) internal {
        rootHashProposals[_proposer].status = RootHashStatus.Rejected;
        emit RootHashRejected(_proposer, rootHashProposals[_proposer].rootHash);
    }

    /** @notice updates root hash proposal data structure  and contract state variables
     *  to mark root hash is accepted
     */
    function acceptRootHash(address _proposer) internal {
        RootHashProposal storage proposal = rootHashProposals[_proposer];

        proposal.status = RootHashStatus.Accepted;
        acceptedRootHash = proposal.rootHash;
        acceptedTotalSum = proposal.totalSum;
        acceptedAmountOfAccounts = proposal.amountOfAccounts;
        feeCollectionEnds = getTime() + FEE_COLLECTION_TIME;
        emit RootHashAccepted(
            _proposer,
            acceptedRootHash,
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
        bytes32 _leaf,
        uint256 _index,
        uint256 _numAccounts
    ) internal view returns (bool) {
        // ensure that the proof conforms to the minimum possible tree height
        // and also that the number of accounts is small enough to fit in the claimed tree
        if (
            2**(_proof.length - 1) > _numAccounts ||
            2**(_proof.length) < _numAccounts
        ) {
            return false;
        }

        bytes32 computedHash = _leaf;

        // checks for validity of proof elements and tree ordering
        for (uint256 i = 0; i < _proof.length; i++) {
            bytes32 proofElement = _proof[i];
            if ((_index >> i) & 1 == 1) {
                // Hash(current element of the _proof + current computed hash)
                computedHash = keccak256(
                    abi.encodePacked(proofElement, computedHash)
                );
            } else {
                // Hash(current computed hash + current element of the _proof)
                computedHash = keccak256(
                    abi.encodePacked(computedHash, proofElement)
                );
            }
        }

        // verifies that unused tree nodes are reperesnted by bytes32(0)
        for (uint256 i = _proof.length; i > 0; i--) {
            // check if we're traversing the right edge of the filled tree
            // _numAccounts indexes from 1 but _index does so from zero
            if (
                (_index >> (i - 1)) & 1 == ((_numAccounts - 1) >> (i - 1)) & 1
            ) {
                // see if we are in a left branch requiring a zero valued right branch
                if ((_index >> (i - 1)) & 1 == 0) {
                    if (_proof[i - 1] != ALLOWED_ZERO_DATA[i - 1]) {
                        return false;
                    }
                }
            } else {
                // we are now in the middle of the tree, cannot check further
                break;
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

        proposal.totalChallenges = proposal.totalChallenges + 1;
        proposal.amountPendingChallenges = proposal.amountPendingChallenges + 1;
        challenge.amountOfRequests = challenge.amountOfRequests + 1;
        challenge.challengeEnds = challenge.challengeEnds + 1 hours;

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
        require(
            getToken().transferFrom(_submitter, address(this), _fee),
            "Transfer Failed"
        );
        rootHashProposals[_proposal].stakedAmount =
            rootHashProposals[_proposal].stakedAmount +
            _fee;
    }

    /** @notice Get the associated ERC20 token address.
     */
    function getToken() private view returns (IERC20) {
        return IERC20(policyFor(ID_ECO));
    }

    /** @notice Get the associated balance store address.
     */
    function getStore() private view returns (IECO) {
        return IECO(policyFor(ID_ECO));
    }
}
