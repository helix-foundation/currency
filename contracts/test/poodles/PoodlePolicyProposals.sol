// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/community/PolicyProposals.sol";

/** @title SwitcherTimedPolicies
 * Delegate call function data contract for setter functions
 */
contract PoodlePolicyProposals is PolicyProposals {

    constructor(Policy _policy, PolicyVotes _policyVotes, ECO _ecoAddr) PolicyProposals(_policy, _policyVotes, _ecoAddr) {}

    function poke() public pure returns (string memory) {
        return "ow!! PolicyProposals";
    }
}