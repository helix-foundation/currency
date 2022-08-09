// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/community/ECOxStaking.sol";

contract NECOxStaking is ECOxStaking {
    
    constructor() ECOxStaking(Policy(address(0)), address(0)) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NECOxStaking";
    }
}