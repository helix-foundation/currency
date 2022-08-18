// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../monetary/Lockup.sol";
import "../../policy/PolicedUtils.sol";
import "../../currency/ECO.sol";
import "../../currency/ECOx.sol";
import "./ECOxStaking.sol";

/** @title VotingPower
 * Compute voting power for user
 */
contract VotingPower is PolicedUtils {
    // ECOx voting power is snapshotted when the contract is cloned
    uint256 public totalECOxVotingPower;

    // voting power to exclude from totalVotingPower
    uint256 public excludedVotingPower;

    // the ECO contract address
    ECO public immutable ecoToken;

    constructor(Policy _policy, ECO _ecoAddr) PolicedUtils(_policy) {
        require(
            address(_ecoAddr) != address(0),
            "Unrecoverable: do not set the _ecoAddr as the zero address"
        );
        ecoToken = _ecoAddr;
    }

    function totalVotingPower(uint256 _blockNumber)
        public
        view
        returns (uint256)
    {
        uint256 _supply = ecoToken.totalSupplyAt(_blockNumber);

        return _supply + totalECOxVotingPower - excludedVotingPower;
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
