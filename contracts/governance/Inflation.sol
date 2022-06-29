// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../policy/Policy.sol";
import "../policy/PolicedUtils.sol";
import "../currency/ECO.sol";
import "./CurrencyTimer.sol";
import "../utils/TimeUtils.sol";
import "../VDF/VDFVerifier.sol";
import "../currency/InflationRootHashProposal.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/** @title Inflation
 *
 * This contract oversees the currency random inflation process and is spawned
 * on demand by the CurrencyTimer.
 */
contract Inflation is PolicedUtils, TimeUtils {
    // Change this so nodes vote on total_eco and eco_per_claimNumber, compute
    // claim numbers and distribute over 28 days (2 generations).
    /** The time period over which inflation reward is spread to prevent
     *  flooding by spreading out the new tokens.
     */
    uint256 public constant CLAIM_PERIOD = 28 days;

    /** The bound on how much more than the uint256 previous blockhash can a submitted prime be
     */
    uint256 public constant PRIME_BOUND = 1000;

    /** The per-participant reward amount in basic unit of 10^{-18} ECO (weico) selected by the voting process.
     */
    uint256 public reward;

    /** The computed number of reward recipients (inflation/reward) in basic unit of 10^{-18} ECO (weico).
     */
    uint256 public numRecipients;

    /** The block number to use as the reference point when checking if an account holds currency.
     */
    uint256 public blockNumber;

    /** The generation to use as the reference point for inflation policies
     */
    uint256 public generation;

    /** The initial value used for VDF to compute random seed. This is set by a
     * call to `commitEntropyVDFSeed()` after the vote results are computed.
     */
    uint256 public entropyVDFSeed;

    /** The random seed used to determine the inflation reward recipients.
     */
    bytes32 public seed;

    /** Difficulty of VDF for random process. This is left mutable for easier governance */
    uint256 public randomVDFDifficulty;

    /** Timestamp to start claim period from */
    uint256 public claimPeriodStarts;

    /** A mapping recording which claim numbers have been claimed.
     */
    mapping(uint256 => bool) public claimed;

    /** The base VDF implementation */
    VDFVerifier public vdfVerifier;

    // the ECO token address
    ECO public immutable ecoToken;

    // the CurrencyTimer address
    CurrencyTimer public immutable currencyTimer;

    /** Fired when a user claims their reward */
    event Claimed(address indexed who, uint256 sequence);

    /** Emitted when the VDF seed used to provide entropy has been committed to the contract.
     */
    event EntropyVDFSeedCommitted(uint256 seed);

    /** Emitted when the entropy seed is revealed by provable VDF computation.
     */
    event EntropySeedRevealed(bytes32 seed);

    constructor(
        Policy _policy,
        VDFVerifier _vdfVerifierImpl,
        uint256 _randomDifficulty,
        ECO _ecoAddr,
        CurrencyTimer _timerAddr
    ) PolicedUtils(_policy) {
        vdfVerifier = _vdfVerifierImpl;
        randomVDFDifficulty = _randomDifficulty;
        ecoToken = _ecoAddr;
        currencyTimer = _timerAddr;
    }

    /** Clean up the inflation contract.
     *
     * Can only be called after all rewards
     * have been claimed.
     */
    function destruct() external {
        if (seed != 0) {
            /* The higher bound for the loop iterations is the number
             * of reward recipients according to a vote by trusted nodes.
             * It is supposed to be a reasonable number which does not impose a threat
             * to a system from a gas consumption standpoint.
             */
            for (uint256 i = 0; i < numRecipients; ++i) {
                require(
                    claimed[i],
                    "All rewards must be claimed prior to destruct"
                );
            }
        }

        require(
            ecoToken.transfer(
                address(policy),
                ecoToken.balanceOf(address(this))
            ),
            "Transfer Failed"
        );
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
        generation = currencyTimer.currentGeneration() - 1;
        blockNumber = block.number;
        vdfVerifier = VDFVerifier(Inflation(_self).vdfVerifier().clone());
        randomVDFDifficulty = Inflation(_self).randomVDFDifficulty();
    }

    /** Commit to a VDF seed for inflation distribution entropy.
     *
     * Can only be called after results are computed and the registration
     * period has ended. The VDF seed can only be set once.
     *
     * @param _distance uint256 the distance from the last blockhash as uint256 and
     *                  the prime number to commit
     */
    function commitEntropyVDFSeed(uint256 _distance) external {
        require(entropyVDFSeed == 0, "The VDF seed has already been set");

        /* While the block hash is entirely predictable and manipulatable,
         * the delay imposed by computing the VDF makes prediction or
         * effective manipulation sufficiently difficult that it can't be
         * done inside the block creation time, ensuring that miners can't
         * manipulate the outcome.
         * In order to discourage precomputation attacks, we require the
         * VDF input to be prime.
         */
        uint256 _bhash = uint256(blockhash(block.number - 1));
        uint256 _capDistance = type(uint256).max - _bhash;
        uint256 _bound = _capDistance >= PRIME_BOUND
            ? PRIME_BOUND
            : _capDistance;
        require(_distance < _bound, "suggested prime is out of bounds");

        uint256 x = _bhash + _distance;

        require(
            !(x % 3 == 0) &&
                !(x % 5 == 0) &&
                !(x % 7 == 0) &&
                !(x % 11 == 0) &&
                !(x % 13 == 0) &&
                vdfVerifier.isProbablePrime(x, 10),
            "distance does not point to prime number, either the block has progressed or distance is wrong"
        );

        entropyVDFSeed = x;

        emit EntropyVDFSeedCommitted(entropyVDFSeed);
    }

    function startInflation(uint256 _numRecipients, uint256 _reward) external {
        require(
            _numRecipients > 0 && _reward > 0,
            "Contract must have rewards"
        );
        require(
            ecoToken.balanceOf(address(this)) >= _numRecipients * _reward,
            "The contract must have a token balance at least the total rewards"
        );
        require(numRecipients == 0, "The sale can only be started once");

        /* This sets the amount of recipients we will iterate through later, it is important
        this number stay reasonable from gas consumption standpoint */
        numRecipients = _numRecipients;
        reward = _reward;
        claimPeriodStarts = getTime();
    }

    /** Submit a solution for VDF for randomness.
     *
     * @param _y The computed VDF output. Must be proven with the VDF
     *           verification contract.
     */
    function submitEntropyVDF(bytes calldata _y) external {
        require(entropyVDFSeed != 0, "Initial seed must be set");
        require(seed == bytes32(0), "Can only submit once");

        require(
            vdfVerifier.isVerified(entropyVDFSeed, randomVDFDifficulty, _y),
            "The VDF output value must be verified by the VDF verification contract"
        );

        seed = keccak256(_y);

        emit EntropySeedRevealed(seed);
    }

    /** Claim an inflation reward on behalf of some address.
     *
     * The reward is sent directly to the address that has claim to the reward, but the
     * gas cost is paid by the caller.
     *
     * For example, an exchange might stake using funds deposited into its
     * contract.
     *
     * @param _who The address to claim a reward on behalf of.
     * @param _sequence The reward sequence number to determine if the address
     *                  gets paid.
     */
    function claimFor(
        address _who,
        uint256 _sequence,
        bytes32[] memory _proof,
        uint256 _sum,
        uint256 _index
    ) public {
        require(seed != bytes32(0), "Must prove VDF before claims can be paid");
        require(
            _sequence < numRecipients,
            "The provided sequence number must be within the set of recipients"
        );
        require(
            getTime() >
                claimPeriodStarts + (_sequence * CLAIM_PERIOD) / numRecipients,
            "A claim can only be made after enough time has passed - please wait longer"
        );
        require(
            !claimed[_sequence],
            "A claim can only be made if it has not already been made"
        );

        InflationRootHashProposal rootHashContract = InflationRootHashProposal(
            currencyTimer.rootHashAddressPerGeneration(generation)
        );

        require(
            rootHashContract.acceptedRootHash() != 0,
            "A claim can only be made after root hash for this generation was accepted"
        );

        require(
            rootHashContract.verifyClaimSubmission(_who, _proof, _sum, _index),
            "A claim submission failed root hash verification"
        );

        claimed[_sequence] = true;

        uint256 claimable = uint256(
            keccak256(abi.encodePacked(seed, _sequence))
        ) % rootHashContract.acceptedTotalSum();

        require(
            claimable < ecoToken.getPastVotes(_who, blockNumber) + _sum,
            "The provided address cannot claim this reward."
        );
        require(
            claimable >= _sum,
            "The provided address cannot claim this reward."
        );

        require(ecoToken.transfer(_who, reward), "Transfer Failed");

        emit Claimed(_who, _sequence);
    }

    /** Claim an inflation reward for yourself.
     *
     * You need to know your claim number's place in the order.
     *
     * @param _sequence Your claim number's place in the order.
     */
    function claim(
        uint256 _sequence,
        bytes32[] calldata _proof,
        uint256 _sum,
        uint256 _index
    ) external {
        claimFor(msg.sender, _sequence, _proof, _sum, _index);
    }
}
