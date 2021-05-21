// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface ILockups {
    function lockups(uint256) external view returns (address);
}
