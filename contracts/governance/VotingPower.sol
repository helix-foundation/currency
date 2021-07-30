// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./ILockups.sol";
import "./Lockup.sol";
import "../policy/PolicedUtils.sol";
import "../currency/EcoBalanceStore.sol";
import "../currency/ECOx.sol";

/** @title VotingPower
 * Compute voting power for user
 */
contract VotingPower is PolicedUtils {
    using SafeMath for uint256;

    constructor(address _policy) public PolicedUtils(_policy) {}

    function totalVotingPower(uint256 _gen) public view returns (uint256) {
        uint256 total = getStore().totalSupplyAt(_gen);

        ECOx ecox = getX();

        uint256 totalx =
            ecox.totalSupplyAt(_gen).sub(
                ecox.balanceAt(address(ecox), _gen)
            );
        if (totalx > 0) {
            total = total.add(ecox.valueAt(totalx, _gen));
        }

        return total;
    }

    function votingPower(
        address _who,
        uint256 _generation,
        uint256[] memory _lockups
    ) public view returns (uint256) {
        uint256 power = getStore().balanceAt(_who, _generation);

        ECOx ecox = getX();
        uint256 x = ecox.balanceAt(_who, _generation);
        if (x > 0) {
            power = power.add(
                ecox.valueAt(ecox.balanceAt(_who, _generation), _generation)
            );
        }

        ILockups lockups = ILockups(policyFor(ID_CURRENCY_TIMER));
        for (uint256 i = 0; i < _lockups.length; ++i) {
            uint256 gen = _lockups[i];
            require(gen <= _generation, "Lockup newer than voting period");

            Lockup lockup = Lockup(lockups.lockups(gen));
            require(address(lockup) != address(0), "No lockup for generation");

            power = power.add(lockup.depositBalances(_who));
        }

        return power;
    }

    /** Get the associated balance store address.
     */
    function getStore() internal view returns (EcoBalanceStore) {
        return EcoBalanceStore(policyFor(ID_BALANCESTORE));
    }

    function getX() internal view returns (ECOx) {
        return ECOx(policyFor(ID_ECOX));
    }
}
