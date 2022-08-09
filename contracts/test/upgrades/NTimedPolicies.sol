// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/TimedPolicies.sol";

contract NTimedPolicies is TimedPolicies {
    
    constructor() TimedPolicies(Policy(address(0)), PolicyProposals(address(0)), new bytes32[](0)) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NTimedPolicies";
    }
}