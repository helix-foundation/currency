// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./ILockups.sol";
import "./Lockup.sol";
import "../policy/PolicedUtils.sol";
import "../currency/EcoBalanceStore.sol";
import "../currency/ECOx.sol";
import "./ECOxLockup.sol";

/** @title VotingPower
 * Compute voting power for user
 */
contract VotingPower is PolicedUtils {
    using SafeMath for uint256;

    constructor(address _policy) public PolicedUtils(_policy) {}

    function totalVotingPower(uint256 _gen) public view returns (uint256) {
        uint256 total = getStore().totalSupplyAt(_gen - 1);

        uint256 totalx = getXLockup().totalVotingECOx(_gen);
        if (totalx > 0) {
            total = total.add(getX().valueAt(totalx, _gen - 1));
        }

        return total;
    }

    function votingPower(
        address _who,
        uint256 _generation,
        uint256[] memory _lockups
    ) public view returns (uint256) {
        uint256 _power = getStore().balanceAt(_who, _generation - 1);

        uint256 _x = getXLockup().votingECOx(_who, _generation);
        if (_x > 0) {
            _power = _power.add(getX().valueAt(_x, _generation - 1));
        }

        ILockups lockups = ILockups(policyFor(ID_CURRENCY_TIMER));
        for (uint256 i = 0; i < _lockups.length; ++i) {
            uint256 _gen = _lockups[i];
            require(_gen < _generation, "Lockup newer than voting period");

            Lockup lockup = Lockup(lockups.lockups(_gen));
            require(address(lockup) != address(0), "No lockup for generation");

            _power = _power.add(lockup.depositBalances(_who));
        }

        return _power;
    }

    function recordVote(address _who) internal {
        getXLockup().recordVote(_who);
    }

    /** Get the associated balance store address.
     */
    function getStore() internal view returns (EcoBalanceStore) {
        return EcoBalanceStore(policyFor(ID_BALANCESTORE));
    }

    function getX() internal view returns (ECOx) {
        return ECOx(policyFor(ID_ECOX));
    }

    function getXLockup() internal view returns (ECOxLockup) {
        return ECOxLockup(policyFor(ID_ECOXLOCKUP));
    }
}
