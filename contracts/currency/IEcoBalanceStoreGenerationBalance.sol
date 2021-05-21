// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

interface IEcoBalanceStoreGenerationBalance {
    function balanceAt(address _owner, uint256 _pastGeneration)
        external
        view
        returns (uint256);
}
