// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../currency/ECOx.sol";

contract NECOx is ECOx {
    
    constructor() ECOx(Policy(address(0)), address(0), 0, address(0)) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NECOx";
    }
}