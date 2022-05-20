// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/** @title Target for approveAndCall test */
contract TokenTarget {
    // Token to use
    ERC20 public token;

    constructor(address _token) {
        token = ERC20(_token);
    }

    /** @notice Try to retrieve approved funds */
    function take(address _who, uint256 _amount) public {
        require(
            token.transferFrom(_who, address(this), _amount),
            "Failed transfer"
        );
    }
}
