// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/community/PolicyProposals.sol";

contract NPolicyProposals is PolicyProposals {
    
    // policy votes is held in contract storage so doesn't need to be passed
    constructor(Policy _policy, ECO _eco, ECOx _ecox) PolicyProposals(_policy, PolicyVotes(address(0)), _eco, _ecox) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NPolicyProposals";
    }
}