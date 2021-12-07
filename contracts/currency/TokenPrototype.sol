/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../policy/PolicedUtils.sol";
import "./EcoBalanceStore.sol";
import "./TokenEvents.sol";

abstract contract TokenPrototype is PolicedUtils, TokenEvents {
    EcoBalanceStore internal store;

    constructor(address _policy) internal PolicedUtils(_policy) {
        updateStore();
    }

    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        updateStore();
    }

    modifier onlyStore() {
        require(
            msg.sender == address(store),
            "Only the balanceStore can call this"
        );
        _;
    }

    /** Update the store pointer */
    function updateStore() public {
        store = EcoBalanceStore(policyFor(ID_BALANCESTORE));
    }
}
