// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../currency/ECO.sol";

contract NECO is ECO {
    
    constructor() ECO(Policy(address(0)), address(0), 0) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NECO";
    }
}