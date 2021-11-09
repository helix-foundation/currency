/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

/* solhint-disable no-inline-assembly */

/** @title Target for ForwardProxy and EcoInitializable */
contract ForwardTarget {
    // Must match definition in ForwardProxy
    uint256 private constant IMPLEMENTATION_SLOT =
        0xf86c915dad5894faca0dfa067c58fdf4307406d255ed0a65db394f82b77f53d4;

    modifier onlyConstruction() {
        require(
            implementation() == address(0),
            "Can only be called during initialization"
        );
        _;
    }

    constructor() public {
        require(
            IMPLEMENTATION_SLOT ==
                uint256(
                    keccak256(abi.encodePacked("com.eco.ForwardProxy.target"))
                ),
            "IMPLEMENTATION_SLOT hash mismatch"
        );
        setImplementation(address(this));
    }

    /** @notice Storage initialization of cloned contract
     *
     * This is used to initialize the storage of the forwarded contract, and
     * should (typically) copy or repeat any work that would normally be
     * done in the constructor of the proxied contract.
     *
     * Implementations of ForwardTarget should override this function,
     * and chain to super.initialize(_self).
     *
     * @param _self The address of the original contract instance (the one being
     *              forwarded to).
     */
    function initialize(address _self) public virtual onlyConstruction {
        setImplementation(address(ForwardTarget(_self).implementation()));
    }

    /** Get the address of the proxy target contract.
     */
    function implementation() public view returns (address _impl) {
        uint256 _sslot = IMPLEMENTATION_SLOT;
        assembly {
            _impl := sload(_sslot)
        }
    }

    /** @notice Set new implementation */
    function setImplementation(address _impl) internal {
        require(implementation() != _impl, "Implementation already matching");
        uint256 _sslot = IMPLEMENTATION_SLOT;
        assembly {
            sstore(_sslot, _impl)
        }
    }
}
