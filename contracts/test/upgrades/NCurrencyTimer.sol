// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/CurrencyTimer.sol";

contract NCurrencyTimer is CurrencyTimer {
    
    // only Policy and ECO needs to be set as it's immutable whereas the others are stored in contract storage
    constructor(Policy _policy, ECO _eco) CurrencyTimer(_policy, CurrencyGovernance(address(0)), RandomInflation(address(0)), Lockup(address(0)), _eco) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NCurrencyTimer";
    }
}