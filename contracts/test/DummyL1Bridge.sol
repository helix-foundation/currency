// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;


contract DummyL1Bridge {
    
    bool public rebased;

    constructor() {
        rebased = false;
    }

    function rebase(uint32 _l2Gas) external {
        rebased = true;
    }
}