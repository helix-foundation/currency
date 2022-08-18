// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../currency/IECO.sol";

/** @title FlashLoaner
 *
 * Used to test the resuliancy of the checkpointing system to flash loans.
 */
contract FlashLoaner {
    address public token;

    constructor(address _token) {
        token = _token;
    }

    function flashLoan(
        address add1,
        address add2,
        uint256 val1,
        uint256 val2
    ) public {
        IECO(token).transferFrom(add1, add2, val1);
        // funny business would happen here for add2
        IECO(token).transferFrom(add2, add1, val2);
    }
}
