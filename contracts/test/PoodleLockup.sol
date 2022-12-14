// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../governance/monetary/Lockup.sol";

/** @title Template Upgrading Process
 *
 * This contract is used to show how the upgrade process can replace a contract template.
 * It only adds functionality to confirm that the contract is replaced. As the templates aren't
 * proxied since they don't need to retain complex long term data, a simple address change
 * is all that is needed.
 */
contract PoodleLockup is Lockup {
    // because the data is not preserved, some information must be copied
    constructor(
        Policy _policy,
        ECO _ecoAddr,
        CurrencyTimer _timerAddr
    ) Lockup(_policy, _ecoAddr, _timerAddr) {}

    function provePoodles() public pure returns (bool) {
        return true;
    }
}
