// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./Token20.sol";

/** @title ERC827 test token */
contract Token827 is Token20 {
    /** @notice Chained approve and call */
    function approveAndCall(
        address payable _spender,
        uint256 _value,
        bytes memory _data
    ) public payable returns (bool) {
        require(_spender != address(this), "Only from spender");

        super.approve(_spender, _value);

        // This should pass through value in ether too, but causes parsing
        // bug with 0.6 syntax in linter
        (bool _success, ) = _spender.call(_data);
        require(_success, "Failed to call");

        return true;
    }
}
