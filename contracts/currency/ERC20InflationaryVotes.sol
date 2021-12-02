/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../currency/ERC20Votes.sol";
import "../governance/ITimeNotifier.sol";

/** @title ERC20InflationaryVotes
 * This implements a generational store with snapshotted balances. Balances
 * are lazy-evaluated, but are effectively all atomically snapshotted when
 * the generation changes.
 */
abstract contract ERC20InflationaryVotes is
    ERC20Votes,
    ITimeNotifier
{
    uint256 public constant INITIAL_INFLATION_MULTIPLIER = 1_000_000_000_000_000_000;

    Checkpoint[] internal _linearInflationCheckpoints;

    /** Construct a new instance.
     *
     * Note that it is always necessary to call reAuthorize on the balance store
     * after it is first constructed to populate the authorized interface
     * contracts cache. These calls are separated to allow the authorized
     * contracts to be configured/deployed after the balance store contract.
     */
    constructor(string memory _name, string memory _symbol) ERC20Votes(_name, _symbol) {
        _writeCheckpoint(_linearInflationCheckpoints, _replace, INITIAL_INFLATION_MULTIPLIER);
    }

    function _beforeTokenTransfer(
        address,
        address,
        uint256 amount
    ) internal virtual override returns (uint256) {
        return amount * _checkpointsLookup(_linearInflationCheckpoints, block.number);
    }

    function getPastLinearInflation(uint256 blockNumber) public view returns (uint256) {
        require(blockNumber < block.number, "ERC20InflationaryVotes: block not yet mined");
        return _checkpointsLookup(_linearInflationCheckpoints, blockNumber);
    }

    /** Access function to determine the token balance held by some address.
     * Function is included for interface compliance and convenience, but just
     * backs into balanceAt
     */
    function balance(address _owner) public view returns (uint256) {
        return balanceAt(_owner, block.number);
    }

    /** Returns the total (inflation corrected) token supply
     */
    function tokenSupply() public view returns (uint256) {
        return totalSupplyAt(block.number);
    }

    /** Returns the total (inflation corrected) token supply at a specified block number
     */
    function totalSupplyAt(uint256 _blockNumber) public view returns (uint256) {
        uint256 _linearInflation = getPastLinearInflation(_blockNumber);

        if (_linearInflation == 0) {
            return 0;
        }

        return getPastTotalSupply(_blockNumber) / _linearInflation;
    }

    /** Return historical balance at given generation.
     *
     * If the latest block number for the account is before the requested
     * block then the most recent known balance is returned. Otherwise the
     * exact block number requested is returned.
     *
     * @param _owner The account to check the balance of.
     * @param _blockNumber The block number to check the balance at the start
     *                        of. Must be less than or equal to the present
     *                        block number.
     */
    function balanceAt(address _owner, uint256 _blockNumber)
        public
        view
        returns (uint256)
    {
        uint256 _linearInflation = getPastLinearInflation(_blockNumber);

        if (_linearInflation == 0) {
            return 0;
        }

        return  getPastVotes(_owner, _blockNumber) / _linearInflation;
    }
}
