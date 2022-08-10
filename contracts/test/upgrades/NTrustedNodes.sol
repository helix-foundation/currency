// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/monetary/TrustedNodes.sol";

contract NTrustedNodes is TrustedNodes {
    
    // only the policy is stored immutably
    constructor(Policy _policy) TrustedNodes(_policy, new address[](0), 0) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NTrustedNodes";
    }
}