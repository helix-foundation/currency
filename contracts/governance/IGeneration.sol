// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IGeneration {
    // returns uint256 generation number
    // generations index from 1000
    function generation() external view returns (uint256);
}
