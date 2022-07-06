// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Lockup.sol";

interface ILockups {
    // takes parameter uint256 generation
    // returns the lockup contract for that generation or address(0) if none was offered
    function lockups(uint256) external view returns (Lockup);
}
