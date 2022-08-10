// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../currency/ECO.sol";

contract NECO is ECO {
    
    /*
     * The distributor can be address(0) as the proxy implementer's distribution doesn't matter
     * same with the initial supply as that's not tracked anywhere
     */
    constructor(Policy _policy) ECO(_policy, address(0), 0) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NECO";
    }
}