// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./ILockups.sol";
import "./Lockup.sol";
import "../policy/PolicedUtils.sol";
import "../currency/IECO.sol";
import "../currency/ECOx.sol";
import "./ECOxLockup.sol";

/** @title VotingPower
 * Compute voting power for user
 */
contract VotingPower is PolicedUtils {
    constructor(address _policy) PolicedUtils(_policy) {}

    function totalVotingPower(uint256 _blockNumber)
        public
        view
        returns (uint256)
    {
        uint256 total = getStore().totalSupplyAt(_blockNumber);

        uint256 totalx = getXLockup().totalVotingECOx(_blockNumber);
        if (totalx > 0) {
            total = total + getX().valueAt(totalx, _blockNumber);
        }

        return total;
    }

    function votingPower(address _who, uint256 _blockNumber)
        public
        view
        returns (uint256)
    {
        uint256 _power = getStore().balanceAt(_who, _blockNumber);

        uint256 _x = getXLockup().votingECOx(_who, _blockNumber);
        if (_x > 0) {
            _power = _power + getX().valueAt(_x, _blockNumber);
        }

        return _power;
    }

    function recordVote(address _who) internal {
        getXLockup().recordVote(_who);
    }

    /** Get the associated balance store address.
     */
    function getStore() internal view returns (IECO) {
        return IECO(policyFor(ID_ECO));
    }

    function getX() internal view returns (ECOx) {
        return ECOx(policyFor(ID_ECOX));
    }

    function getXLockup() internal view returns (ECOxLockup) {
        return ECOxLockup(policyFor(ID_ECOXLOCKUP));
    }
}
