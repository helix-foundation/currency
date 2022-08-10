// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/monetary/CurrencyGovernance.sol";

contract NCurrencyGovernance is CurrencyGovernance {
    
    constructor(Policy _policy) CurrencyGovernance(_policy) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NCurrencyGovernance";
    }
}