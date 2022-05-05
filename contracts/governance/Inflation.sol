// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../policy/Policy.sol";
import "../policy/PolicedUtils.sol";
import "../currency/IECO.sol";
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
    // Change this so nodes vote on total_eco and eco_per_ticket, compute
    // tickets and distribute over 28 days (2 generations).
    /** The time period over which inflation pay-out is spread to prevent
     *  flooding by spreading out the new tokens.
     */
    uint256 public constant PAYOUT_PERIOD = 28 days;

    /** The bound on how much more than the uint256 previous blockhash can a submitted prime be
     */
    uint256 public constant PRIME_BOUND = 1000;

    /** The per-participant pay-out amount in basic unit of 10^{-18} ECO (weico) selected by the voting process.
     */
    uint256 public prize;

    /** The computed number of pay-out winners (inflation/prize) in basic unit of 10^{-18} ECO (weico).
     */
    uint256 public winners;

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

    /** The random seed used to determine the inflation pay-out winners.
     */
    bytes32 public seed;

    /** Difficulty of VDF for random process */
    uint256 public randomVDFDifficulty;

    /** Timestamp to start payout period from */
    uint256 public payoutPeriodStarts;

    /** A mapping recording which tickets have been claimed.
     */
    mapping(uint256 => bool) public claimed;

    /** The base VDF implementation */
    VDFVerifier public vdfVerifier;

    /** Fired when a user claims winnings */
    event Claimed(address indexed who, uint256 sequence);

    /** Emitted when the VDF seed used to provide entropy has been committed to the contract.
     */
    event EntropyVDFSeedCommitted(uint256 seed);

    /** Emitted when the entropy seed is revealed by provable VDF computation.
     */
    event EntropySeedRevealed(bytes32 seed);

    constructor(
        address _policy,
        VDFVerifier _vdfVerifierImpl,
        uint256 _randomDifficulty
    ) PolicedUtils(_policy) {
        vdfVerifier = _vdfVerifierImpl;
        randomVDFDifficulty = _randomDifficulty;
    }

    /** Clean up the inflation contract.
     *
     * Can only be called after all pay-outs
     * have been claimed.
     */
    function destruct() external {
        if (seed != 0) {
            /* The higher bound for the loop iterations is the amount
             * of the winners according to a vote by trusted nodes.
             * It is supposed to be a reasonable number which does not impose a threat
             * to a system from a gas consumption standpoint.
             */
            for (uint256 i = 0; i < winners; ++i) {
                require(
                    claimed[i],
                    "All winnings must be claimed prior to destruct"
                );
            }
        }

        require(
            getToken().transfer(
                address(uint160(policy)),
                getToken().balanceOf(address(this))
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
        generation = getTimer().currentGeneration() - 1;
        blockNumber = block.number;
        vdfVerifier = VDFVerifier(
            VDFVerifier(Inflation(_self).vdfVerifier()).clone()
        );
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

    function startInflation(uint256 _winners, uint256 _prize) external {
        require(_winners > 0 && _prize > 0, "Contract must have rewards");
        require(
            getToken().balanceOf(address(this)) >= _winners * _prize,
            "The contract must have a token balance at least the total rewards"
        );
        require(winners == 0, "The sale can only be started once");

        /* This sets the amount of winners we will iterate through later, it is important
        this number stay reasonable from gas consumption standpoint */
        winners = _winners;
        prize = _prize;
        payoutPeriodStarts = getTime();
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

    /** Claim an inflation pay-out on behalf of some address.
     *
     * The pay-out is sent directly to the address winning the pay-out, but the
     * gas cost is paid by the caller.
     *
     * For example, an exchange might stake using funds deposited into its
     * contract.
     *
     * @param _who The address to claim a pay-out on behalf of.
     * @param _sequence The pay-out sequence number to determine if the address
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
            _sequence < winners,
            "The provided sequence number must be within the set of winners"
        );
        require(
            getTime() >
                payoutPeriodStarts + (_sequence * PAYOUT_PERIOD) / winners,
            "A claim can only be made after enough time has passed - please wait longer"
        );
        require(
            !claimed[_sequence],
            "A claim can only be made if it has not already been made"
        );

        InflationRootHashProposal rootHashContract = InflationRootHashProposal(
            getTimer().rootHashAddressPerGeneration(generation)
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

        uint256 _winner = uint256(
            keccak256(abi.encodePacked(seed, _sequence))
        ) % rootHashContract.acceptedTotalSum();

        require(
            _winner < getToken().balanceAt(_who, blockNumber) + _sum,
            "The provided address does not hold a winning ticket"
        );
        require(
            _winner >= _sum,
            "The provided address does not hold a winning ticket."
        );

        require(getToken().transfer(_who, prize), "Transfer Failed");

        emit Claimed(_who, _sequence);
    }

    /** Claim an inflation pay-out for yourself.
     *
     * You need to know your ticket number.
     *
     * @param _sequence Your inflation ticket number.
     */
    function claim(
        uint256 _sequence,
        bytes32[] calldata _proof,
        uint256 _sum,
        uint256 _index
    ) external {
        claimFor(msg.sender, _sequence, _proof, _sum, _index);
    }

    /** Get the token address.
     */
    function getToken() private view returns (IECO) {
        return IECO(policyFor(ID_ECO));
    }

    /** Get the currency timer address.
     */
    function getTimer() private view returns (CurrencyTimer) {
        return CurrencyTimer(policyFor(ID_CURRENCY_TIMER));
    }
}
