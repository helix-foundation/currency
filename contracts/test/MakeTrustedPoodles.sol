// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../policy/Policy.sol";
import "../policy/Policed.sol";
import "../proxy/ForwardTarget.sol";
import "../governance/community/Proposal.sol";

/** @title MakeTrustedPoodle
 * A proposal to add a new function to TrustedNodes.sol
 */
contract MakeTrustedPoodles is Policy, Proposal {
    /** The address of the updated TrustedNodes contract
     */
    address public immutable newTrustedNodes;

    /** The address of the updating contract
     */
    address public immutable implementationUpdatingTarget;

    // The ID hash for the TrustedNodes contract
    bytes32 public constant trustedNodesId =
        keccak256(abi.encodePacked("TrustedNodes"));

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
     */
    function enacted(address) public override {
        address _trustedNodes = policyFor(trustedNodesId);

        Policed(_trustedNodes).policyCommand(
            implementationUpdatingTarget,
            abi.encodeWithSignature(
                "updateImplementation(address)",
                newTrustedNodes
            )
        );
    }
}
