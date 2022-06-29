// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

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
    // the ECO contract address
    IECO public immutable ecoToken;

    // the ECOx contract address
    ECOx public immutable ecoXToken;

    constructor(
        address _policy,
        address _ecoAddr,
        address _ecoXAddr
    ) PolicedUtils(_policy) {
        ecoToken = IECO(_ecoAddr);
        ecoXToken = ECOx(_ecoXAddr);
    }

    function totalVotingPower(uint256 _blockNumber)
        public
        view
        returns (uint256)
    {
        uint256 total = ecoToken.totalSupplyAt(_blockNumber);
        uint256 totalx = getXLockup().totalVotingECOx(_blockNumber);

        return total + totalx;
    }

    function votingPower(address _who, uint256 _blockNumber)
        public
        view
        returns (uint256)
    {
        uint256 _power = ecoToken.getPastVotes(_who, _blockNumber);
        uint256 _powerx = getXLockup().votingECOx(_who, _blockNumber);

        return _power + _powerx;
    }

    function recordVote(address _who) internal {
        getXLockup().recordVote(_who);
    }

    function getXLockup() internal view returns (ECOxLockup) {
        return ECOxLockup(policyFor(ID_ECOXLOCKUP));
    }
}
