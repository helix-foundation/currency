/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IECO is IERC20 {
    // address to, uint256 amount
    function mint(address, uint256) external;

    // address from, uint256 amount
    function burn(address, uint256) external;

    function currentGeneration() external view returns (uint256);

    // address owner, uint256 blockNumber
    function balanceAt(address, uint256) external view returns (uint256);

    // uint256 blockNumber
    function totalSupplyAt(uint256) external view returns (uint256);
}
