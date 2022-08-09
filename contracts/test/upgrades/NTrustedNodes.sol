// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/monetary/TrustedNodes.sol";

contract NTrustedNodes is TrustedNodes {
    
    constructor() TrustedNodes(Policy(address(0)), new address[](0), 0) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NTrustedNodes";
    }
}