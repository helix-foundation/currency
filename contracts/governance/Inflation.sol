// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../policy/Policy.sol";
import "../policy/PolicedUtils.sol";
import "../currency/EcoBalanceStore.sol";
import "../utils/TimeUtils.sol";
import "../VDF/VDFVerifier.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/** @title Inflation Process
 *
 * This contract oversees the currency inflation process and is spawned
 * on demand by the CurrencyGovernance.
 */
contract Inflation is PolicedUtils, TimeUtils {
    using SafeMath for uint256;

    // Change this so nodes vote on total_eco and eco_per_ticket, compute
    // tickets and distribute over 28 days.
    /** The time period over which inflation pay-out is spread to prevent the
     * entire quantity from becoming available at once.
     */
    uint256 public constant PAYOUT_PERIOD = 28 days;

    /** The per-participant pay-out amount in basic unit of 10^{-18} (atto) ECO selected by the voting process.
     */
    uint256 public prize;

    /** The computed number of pay-out winners (inflation/prize) in basic unit of 10^{-18} (atto) ECO.
     */
    uint256 public winners;

    /** The generation (in the generational balance store) to use as the
     * reference point when checking if an account holds currency.
     */
    uint256 public generation;

    /** A mapping of account addresses to ticket positions to indicate who holds
     * which ticket.
     */
    mapping(address => uint256) public holders;

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

    /** Emitted when the VDF seed used to provide entropy has been committed to
     * the contract.
     */
    event EntropyVDFSeedCommitted(uint256 seed);

    /** Emitted when the entropy seed is revealed by provable VDF computation.
     */
    event EntropySeedRevealed(bytes32 seed);

    constructor(
        address _policy,
        VDFVerifier _vdfVerifierImpl,
        uint256 _randomDifficulty
    ) public PolicedUtils(_policy) {
        vdfVerifier = _vdfVerifierImpl;
        randomVDFDifficulty = _randomDifficulty;
    }

    /** Self-destruct the inflation contract.
     *
     * Can only be called after all pay-outs
     * have been claimed.
     */
    function destruct() external onlyClone {
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
        } else {
            require(
                getToken().balanceOf(address(this)) == 0,
                "The contract must have 0 balance to be destructed prior seed revealing"
            );
        }
        vdfVerifier.destruct();

        getToken().transfer(
            address(uint160(policy)),
            getToken().balanceOf(address(this))
        );
        selfdestruct(address(uint160(policy)));
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
        generation = getStore().currentGeneration().sub(1);
        vdfVerifier = VDFVerifier(
            VDFVerifier(Inflation(_self).vdfVerifier()).clone()
        );
        randomVDFDifficulty = Inflation(_self).randomVDFDifficulty();
    }

    /** Commit to a VDF seed for inflation distribution entropy.
     *
     * Can only be called after results are computed and the registration
     * period has ended. The VDF seed can only be set once.
     */
    function commitEntropyVDFSeed() external {
        require(entropyVDFSeed == 0, "The VDF seed has already been set");

        /* While the block hash is entirely predictable and manipulatable,
         * the delay imposed by computing the VDF makes prediction or
         * effective manipulation sufficiently difficult that it can't be
         * done inside the block creation time, ensuring that miners can't
         * manipulate the outcome.
         * In order to discourage precomputation attacks, we require the
         * VDF input to be prime. Note that this may run out of gas if
         * there are no primes near the starting point. If that happens, try
         * again.
         */
        uint256 x = uint256(blockhash(block.number - 1)) | 1;

        while (
            ((x % 3) == 0) ||
            (x % 5 == 0) ||
            (x % 7 == 0) ||
            !vdfVerifier.isProbablePrime(x, 10)
        ) {
            x = x.add(2);
        }

        entropyVDFSeed = x;

        emit EntropyVDFSeedCommitted(entropyVDFSeed);
    }

    function startInflation(uint256 _winners, uint256 _prize)
        external
        onlyClone
    {
        require(_winners > 0 && _prize > 0, "Contract must have rewards");
        require(
            getToken().balanceOf(address(this)) >= _winners.mul(_prize),
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
                payoutPeriodStarts.add(
                    (_sequence.mul(PAYOUT_PERIOD)).div(winners)
                ),
            "A claim can only be made after enough time has passed - please wait longer"
        );
        require(
            !claimed[_sequence],
            "A claim can only be made if it has not already been made"
        );

        InflationRootHashProposal rootHashContract =
            getStore().rootHashAddressPerGeneration(generation);

        require(
            rootHashContract.acceptedRootHash() != 0,
            "A claim can only be made after root hash for this generation was accepted"
        );

        require(
            rootHashContract.verifyClaimSubmission(_who, _proof, _sum, _index),
            "A claim submission failed root hash verification"
        );

        claimed[_sequence] = true;

        uint256 _winner =
            uint256(keccak256(abi.encodePacked(seed, _sequence))) %
                rootHashContract.acceptedTotalSum();

        require(
            _winner < getStore().balanceAt(_who, generation).add(_sum),
            "The provided address does not hold a winning ticket"
        );
        require(
            _winner >= _sum,
            "The provided address does not hold a winning ticket."
        );

        getToken().transfer(_who, prize);

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
        claimFor(_msgSender(), _sequence, _proof, _sum, _index);
    }

    /** Get the associated balance store address.
     */
    function getStore() private view returns (EcoBalanceStore) {
        return EcoBalanceStore(policyFor(ID_BALANCESTORE));
    }

    /** Get the associated ERC20 token address.
     */
    function getToken() private view returns (IERC20) {
        return IERC20(policyFor(ID_ERC20TOKEN));
    }
}
