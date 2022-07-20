// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../monetary/ILockups.sol";
import "../monetary/Lockup.sol";
import "../../policy/PolicedUtils.sol";
import "../../currency/ECO.sol";
import "../../currency/ECOx.sol";
import "./ECOxStaking.sol";

/** @title VotingPower
 * Compute voting power for user
 */
contract VotingPower is PolicedUtils {
    // the ECO contract address
    ECO public immutable ecoToken;

    // the ECOx contract address
    ECOx public immutable ecoXToken;

    constructor(
        Policy _policy,
        ECO _ecoAddr,
        ECOx _ecoXAddr
    ) PolicedUtils(_policy) {
        ecoToken = _ecoAddr;
        ecoXToken = _ecoXAddr;
    }

    function totalVotingPower(uint256 _blockNumber)
        public
        view
        returns (uint256)
    {
        uint256 total = ecoToken.totalSupplyAt(_blockNumber);
        uint256 totalx = ecoXToken.totalSupply();

        return total + totalx;
    }

    function votingPower(address _who, uint256 _blockNumber)
        public
        view
        returns (uint256)
    {
        uint256 _power = ecoToken.getPastVotes(_who, _blockNumber);
        uint256 _powerx = getXStaking().votingECOx(_who, _blockNumber);
        return _power + _powerx;
    }

    function getXStaking() internal view returns (ECOxStaking) {
        return ECOxStaking(policyFor(ID_ECOXSTAKING));
    }
}
