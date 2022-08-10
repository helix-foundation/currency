// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../currency/ECOx.sol";

contract NECOx is ECOx {
    
    /*
     * The distributor can be address(0) as the proxy implementer's distribution doesn't matter
     * the initial supply needs to be passed and equal to the supply at launch as it's used for conversion
     */
    constructor(Policy _policy, uint256 _initialSupply, address _ecoToken) ECOx(_policy, address(0), _initialSupply, _ecoToken) {}

    function hello() public pure returns (string memory) {
        return "Hello I'm NECOx";
    }
}