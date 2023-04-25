// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../governance/TimedPolicies.sol";

/** @title SwitcherTimedPolicies
 * Delegate call function data contract for setter functions
 */
contract PoodleTimedPolicies is TimedPolicies {

    constructor(Policy _policy, PolicyProposals _policyProposal, bytes32[] memory _notificationHashes) TimedPolicies(_policy, _policyProposal, _notificationHashes) {}

    function poke() public pure returns (string memory) {
        return "yowch!! TimedPolicies";
    }
}