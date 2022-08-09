// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/monetary/CurrencyGovernance.sol";

contract NCurrencyGovernance is CurrencyGovernance {
    
    constructor() CurrencyGovernance(Policy(address(0))) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NCurrencyGovernance";
    }
}