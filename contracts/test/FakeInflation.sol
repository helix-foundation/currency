// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../currency/IECO.sol";
import "./TestPolicy.sol";

/** @title FakeInflation
 *
 * Used to test the Inflation role in the currency system.
 */
contract FakeInflation is TestPolicy {
    function mint(
        IECO _store,
        address _account,
        uint256 _amount
    ) public {
        _store.mint(_account, _amount);
    }
}
