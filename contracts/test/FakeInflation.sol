// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../contracts/currency/EcoBalanceStore.sol";
import "./TestPolicy.sol";

/** @title FakeInflation
 *
 * Used to test the Inflation role in the currency system.
 */
contract FakeInflation is TestPolicy {
    function mint(
        EcoBalanceStore _store,
        address _account,
        uint256 _amount
    ) public {
        _store.mint(_account, _amount);
    }
}
