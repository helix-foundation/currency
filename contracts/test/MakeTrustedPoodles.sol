// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../contracts/policy/Policy.sol";
import "../../contracts/policy/Policed.sol";
import "../../contracts/proxy/ForwardTarget.sol";
import "../../contracts/governance/Proposal.sol";

/** @title MakeTrustedPoodle
 * A proposal to add a new function to TrustedNodes.sol
 */
contract MakeTrustedPoodles is Policy, Proposal {
    /** The address of the updated TrustedNodes contract
     */
    address public newTrustedNodes;

    /** The address of the updating contract
     */
    address public implementationUpdatingTarget;

    /** Instantiate a new proposal.
     *
     * @param _newTrustedNodes The address of the updated TrustedNodes contract
     */
    constructor(address _newTrustedNodes, address _implementationUpdatingTarget)
    {
        newTrustedNodes = _newTrustedNodes;
        implementationUpdatingTarget = _implementationUpdatingTarget;
    }

    /** The name of the proposal.
     */
    function name() public pure override returns (string memory) {
        return "MakeTrustedPoodles";
    }

    /** A description of what the proposal does.
     */
    function description() public pure override returns (string memory) {
        return "Make TrustedNodes acknowledge the Poodles";
    }

    /** A URL where more details can be found.
     */
    function url() public pure override returns (string memory) {
        return "https://description.of.proposal";
    }

    /** Enact the proposal.
     *
     * This is executed in the storage context of the root policy contract.
     *
     * @param _self The address of the proposal.
     */
    function enacted(address _self) public override {
        bytes32 _trustedNodesId = keccak256(abi.encodePacked("TrustedNodes"));
        address _trustedNodes = policyFor(_trustedNodesId);

        address _newTrustedNodes = MakeTrustedPoodles(_self).newTrustedNodes();
        address _implementationUpdatingTarget = MakeTrustedPoodles(_self)
            .implementationUpdatingTarget();

        Policed(_trustedNodes).policyCommand(
            _implementationUpdatingTarget,
            abi.encodeWithSignature(
                "updateImplementation(address)",
                _newTrustedNodes
            )
        );
    }
}
