/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./ForwardTarget.sol";

/* solhint-disable avoid-low-level-calls, no-inline-assembly */

/** @title Upgradable proxy */
contract ForwardProxy {
    /** Construct a new proxy.
     *
     * @param _impl The default target address.
     */
    constructor(ForwardTarget _impl) public {
        (bool _success, ) =
            address(_impl).delegatecall(
                abi.encodeWithSelector(_impl.initialize.selector, _impl)
            );
        require(_success, "initialize call failed");

        // Store forwarding target address at specified storage slot, copied
        // from ForwardTarget#IMPLEMENTATION_SLOT
        assembly {
            sstore(
                0xf86c915dad5894faca0dfa067c58fdf4307406d255ed0a65db394f82b77f53d4,
                _impl
            )
        }
    }

    /** @notice Default function that forwards call to proxy target
     */
    fallback() external payable {
        /* This default-function is optimized for minimum gas cost, to make the
         * proxy overhead as small as possible. As such, the entire function is
         * structured to optimize gas cost in the case of successful function
         * calls. As such, calls to e.g. calldatasize and calldatasize are
         * repeated, since calling them again is no more expensive than
         * duplicating them on stack.
         * This is also the only function in this contract, which avoids the
         * function dispatch overhead.
         */
        assembly {
            // Copy all call arguments to memory starting at 0x0
            calldatacopy(0x0, 0, calldatasize())

            // Forward to proxy target (loaded from 0xd0fa...), using
            // arguments from memory 0x0 and having results written to
            // memory 0x0.
            // Unfortunately, Yul doesn't allow referencing constants, so
            // 0xd0fa... is copied from ForwardTarget#IMPLEMENTATION_SLOT
            if delegatecall(
                gas(),
                sload(
                    0xf86c915dad5894faca0dfa067c58fdf4307406d255ed0a65db394f82b77f53d4
                ),
                0x0,
                calldatasize(),
                0,
                0
            ) {
                // If the call was successful, copy result into return
                // buffer and return
                returndatacopy(0x0, 0, returndatasize())
                return(0x0, returndatasize())
            }

            // If the call was not successful, copy result from return
            // buffer and revert
            returndatacopy(0x0, 0, returndatasize())
            revert(0x0, returndatasize())
        }
    }
}
