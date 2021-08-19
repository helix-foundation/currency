/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../policy/PolicedUtils.sol";
import "../governance/ITimeNotifier.sol";
import "../governance/IGeneration.sol";
import "./IEcoBalanceStoreGenerationBalance.sol";

/** @title Generational Store
 * This implements a generational store with snapshotted balances. Balances
 * are lazy-evaluated, but are effectively all atomically snapshotted when
 * the generation changes.
 */
abstract contract GenerationStore is
    PolicedUtils,
    ITimeNotifier,
    IEcoBalanceStoreGenerationBalance
{
    using SafeMath for uint256;

    /* Event to be emitted whenever track of balance generations updated.
     */
    event AccountBalanceGenerationUpdate(
        address indexed owner,
        uint256 generation
    );

    /* Current generation of the balance store. */
    uint256 public currentGeneration;

    /* Minimum number of generations to keep. */
    uint256 public constant GENERATIONS_TO_KEEP = 3;

    /* Starting value for generation store */
    uint256 public constant GENERATION_START = 1000;

    /* Mapping from generation index to historical total supply.
     * Includes the current generation.
     */
    mapping(uint256 => uint256) public historicTotalSupplyUninflated;

    /* Mapping from generation index to historical inflation scale factor.
     * Includes the current generation.
     */
    mapping(uint256 => uint256) public historicLinearInflation;

    /* A mapping to store the actual balances of tokens held by each
     * address, with monthly snapshots.
     * The balances values are in the uninflated units which are (initially)
     * units of 10^-36 ECO
     */
    mapping(uint256 => mapping(address => uint256)) public balances;

    /* Last generation account was updated for.
     *
     * This represents the current generation of the address, and is always
     * greater than or equal to cleanedForAddress. Whenever the generation of
     * an address is updated the cleanedForAddress marker should also be updated
     * in order to free storage on chain. In general,
     *   generationForAddress[A] - cleanedForAddress[A] == GENERATIONS_TO_KEEP
     * the notable exception to this is when there are less than
     * GENERATIONS_TO_KEEP generations worth of history for the address.
     *
     * The current balance of an address A is:
     *   balances[generationForAddress[A]][A]
     *
     * generationForAddress[A] == cleanedForAddress[A] when address A has never
     * held a balance.
     */
    mapping(address => uint256) public generationForAddress;

    /* Last generation account was cleaned for.
     *
     * A generation is cleaned for an address when address balance is being
     * updated and the generation is no longer needed (eg it's too old to be
     * relevant).
     *
     * The constraint cleanedForAddress[A] <= generationForAddress[A] is always
     * met, and the equality cleanedForAddress[A] == generationForAddress[A] is
     * true only when the address A has never held any balance.
     */
    mapping(address => uint256) private cleanedForAddress;

    /** Construct a new GenerationStore instance.
     *
     * Note that it is always necessary to call reAuthorize on the balance store
     * after it is first constructed to populate the authorized interface
     * contracts cache. These calls are separated to allow the authorized
     * contracts to be configured/deployed after the balance store contract.
     */
    constructor(address _policy) internal PolicedUtils(_policy) {
        currentGeneration = GENERATION_START;
        historicLinearInflation[GENERATION_START] = 1;
    }

    /** Access function to determine the token balance held by some address.
     * Function is included for interface compliance and convenience, but just
     * backs into balanceAt
     */
    function balance(address _owner) public view returns (uint256) {
        return balanceAt(_owner, currentGeneration);
    }

    /** Returns the total (inflation corrected) token supply
     */
    function tokenSupply() public view returns (uint256) {
        return
            historicTotalSupplyUninflated[currentGeneration].div(
                historicLinearInflation[currentGeneration]
            );
    }

    /** Setter for the total (inflation corrected) token supply
     */
    function setTokenSupply(uint256 _amount) internal {
        historicTotalSupplyUninflated[currentGeneration] = _amount.mul(
            historicLinearInflation[currentGeneration]
        );
    }

    /** Returns the total (inflation corrected) token supply at a specified generation index
     */
    function totalSupplyAt(uint256 _generation) public view returns (uint256) {
        return
            historicTotalSupplyUninflated[_generation].div(
                historicLinearInflation[_generation]
            );
    }

    /** Initialize a balance store based on the storage of the contract at the
     * given address. This is used to initialize proxy contracts.
     *
     * Note that it is always necessary to call reAuthorize on the balance store
     * after it is first initialized to populate the authorized interface
     * contracts cache. These calls are separated to allow the authorized
     * contracts to be configured/deployed after the balance store contract.
     *
     * @param _self The address of the contract to base this contract's
     *              configuration off of.
     */
    function initialize(address _self)
        public
        virtual
        override
        onlyConstruction
    {
        super.initialize(_self);
        currentGeneration = GenerationStore(_self).currentGeneration();
    }

    /** Check if address is updated to current generation.
     *
     * @param _owner The address of the account to check the generation of.
     */
    function isUpdated(address _owner) public view returns (bool) {
        return (generationForAddress[_owner] == currentGeneration);
    }

    /** Transform balance when updating generation
     *
     * This is a callback allowing balances to change during generation
     * updates to reflect economy policies.
     */
    function transformBalance(
        address _owner,
        uint256 _generation,
        uint256 _balance
    ) internal virtual returns (uint256);

    /** Update address to the current generation.
     *
     * This helper updates the generational store for the specified address that
     * generationForAddress[_owner] == currentGeneration, cleans out the old
     * historical generations where appropriate, and updates
     * cleanedForAddress[_owner] to the proper point history,
     * GENERATIONS_TO_KEEP positions behind generationForAddress[_owner]. Any
     * historical generations that must be filled in between the two generation
     * pointers are filled with the most recent balance.
     *
     * @param _owner The account to update the generational history of.
     */
    function updateTo(address _owner, uint256 _targetGeneration) internal {
        // Record the last time we updated this address's generation.
        uint256 _last = generationForAddress[_owner];

        if (_last == currentGeneration) {
            // Early exit if balance is updated
            return;
        }

        require(currentGeneration != 0, "Generation must be initialized");
        require(
            _targetGeneration <= currentGeneration,
            "Cannot update to the future"
        );
        require(_targetGeneration > _last, "Cannot rewrite history");

        /* If the address has no old generation records then we don't need to do
         * any cleaning but we should update the cleaned generation pointer for
         * future reference. This only happens if the address has never been
         * used before, in which case its previous generation pointer will be
         * set to 0.
         */
        if (_last == 0) {
            require(
                _targetGeneration == currentGeneration,
                "New accounts must update to the present"
            );
            cleanedForAddress[_owner] = _targetGeneration - 1;
        } else {
            uint256 _balance = balances[_last][_owner];

            // Write new generational balances
            for (uint256 g = _last + 1; g <= _targetGeneration; ++g) {
                _balance = transformBalance(_owner, g, _balance);
                balances[g][_owner] = _balance;
            }

            // Clean old generational balances
            uint256 _pruneTo = _targetGeneration - GENERATIONS_TO_KEEP;
            for (
                uint256 g = cleanedForAddress[_owner] + 1;
                g <= _pruneTo;
                ++g
            ) {
                balances[g][_owner] = 0;
            }
            cleanedForAddress[_owner] = _pruneTo;
        }

        // Update the address's generation pointer.
        generationForAddress[_owner] = _targetGeneration;
        emit AccountBalanceGenerationUpdate(_owner, _targetGeneration);
    }

    /** Update address to current generation.
     *
     * Calling this function is never required, but it's provided as a
     * convenience so that external systems can prompt an update to the
     * generation pointer for an address.
     */
    function update(address _owner) public {
        updateTo(_owner, currentGeneration);
    }

    function notifyGenerationIncrease() public virtual override {
        uint256 _old = currentGeneration;
        uint256 _new = IGeneration(policyFor(ID_TIMED_POLICIES)).generation();
        require(_new != _old, "Generation has not increased");

        // update currentGeneration
        currentGeneration = _new;
        // make sure the _old values for historicTotalSupplyUninflated and historicLinearInflation are pushed forward
        historicTotalSupplyUninflated[
            currentGeneration
        ] = historicTotalSupplyUninflated[_old];
        historicLinearInflation[currentGeneration] = historicLinearInflation[
            _old
        ];
    }

    /** Return historical balance at given generation.
     *
     * If the latest generation for the account is before the requested
     * generation then the most recent known balance is returned. Otherwise the
     * exact generation requested is returned.
     *
     * Note that this method may return inaccurate results if called on
     * generations too far back from the current generation of the address. Only
     * GENERATIONS_TO_KEEP generations of history are preserved, and 0 will be
     * returned for any generation that is no longer in the historical record.
     * This includes when there is no historical value for inflation.
     *
     * @param _owner The account to check the balance of.
     * @param _pastGeneration The generation to check the balance at the start
     *                        of. Must be less than or equal to the present
     *                        generation (`currentGeneration`).
     */
    function balanceAt(address _owner, uint256 _pastGeneration)
        public
        view
        override
        returns (uint256)
    {
        require(
            _pastGeneration <= currentGeneration,
            "No such generation exists yet!"
        );

        uint256 _linearInflation = historicLinearInflation[_pastGeneration];

        if (_linearInflation == 0) {
            return 0;
        }

        if (_pastGeneration > generationForAddress[_owner]) {
            return
                balances[generationForAddress[_owner]][_owner].div(
                    _linearInflation
                );
        } else {
            return balances[_pastGeneration][_owner].div(_linearInflation);
        }
    }
}
