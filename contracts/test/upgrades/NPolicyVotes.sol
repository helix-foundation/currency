// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/community/PolicyVotes.sol";

contract NPolicyVotes is PolicyVotes {
    
    constructor(Policy _policy, ECO _eco, ECOx _ecox) PolicyVotes(_policy, _eco, _ecox) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NPolicyVotes";
    }
}