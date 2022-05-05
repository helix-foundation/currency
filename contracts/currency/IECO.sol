/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IECO is IERC20 {
    function mint(address, uint256) external;

    function burn(address, uint256) external;

    function currentGeneration() external view returns (uint256);

    function balanceAt(address, uint256) external view returns (uint256);

    function totalSupplyAt(uint256) external view returns (uint256);
}
