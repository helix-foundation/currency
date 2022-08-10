// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/community/ECOxStaking.sol";

contract NECOxStaking is ECOxStaking {
    
    constructor(Policy _policy, address _ecox) ECOxStaking(_policy, _ecox) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NECOxStaking";
    }
}