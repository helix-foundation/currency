// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/CurrencyTimer.sol";

contract NCurrencyTimer is CurrencyTimer {
    
    constructor() CurrencyTimer(Policy(address(0)), CurrencyGovernance(address(0)), RandomInflation(address(0)), Lockup(address(0)), ECO(address(0))) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NCurrencyTimer";
    }
}