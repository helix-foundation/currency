// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/monetary/CurrencyGovernance.sol";

/** @title SwitcherTimedPolicies
 * Delegate call function data contract for setter functions
 */
contract PoodleCurrencyGovernance is CurrencyGovernance {

    constructor(Policy _policy, address _initialPauser) CurrencyGovernance(_policy, _initialPauser) {}

    function poke() public pure returns (string memory) {
        return "owie!! CurrencyGovernance";
    }
}