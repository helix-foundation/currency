// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Lockup.sol";

interface ILockups {
    function lockups(uint256) external view returns (Lockup);
}
