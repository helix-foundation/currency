/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./InflationRootHashProposal.sol";

interface EcoBalanceStore {
    function mint(address, uint256) external;

    function burn(address, uint256) external;

    function inflationRootHashProposalImpl()
        external
        view
        returns (InflationRootHashProposal);

    function rootHashAddressPerGeneration(uint256)
        external
        view
        returns (InflationRootHashProposal);

    function currentGeneration() external view returns (uint256);

    function balanceAt(address, uint256) external view returns (uint256);

    function totalSupplyAt(uint256) external view returns (uint256);
}
