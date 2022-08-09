// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/community/PolicyProposals.sol";

contract NPolicyProposals is PolicyProposals {
    
    constructor() PolicyProposals(Policy(address(0)), PolicyVotes(address(0)), ECO(address(0)), ECOx(address(0))) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NPolicyProposals";
    }
}