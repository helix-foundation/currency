// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../contracts/policy/Policy.sol";
import "../../contracts/policy/Policed.sol";
import "../../contracts/governance/Proposal.sol";
import "../../contracts/governance/TrustedNodes.sol";

/** @title SingleTrusteeReplacement
 * A proposal to replace one trustee
 */
contract SingleTrusteeReplacement is Policy, Proposal {
    // the trustee that will be distrusted
    address public oldTrustee;

    // the trustee that will be trusted
    address public newTrustee;

    /** Instantiate a new proposal.
     *
     * @param _oldTrustee The existing trustee to distrust
     * @param _newTrustee The new address to become trusted
     */
    constructor(address _oldTrustee, address _newTrustee) {
        oldTrustee = _oldTrustee;
        newTrustee = _newTrustee;
    }

    /** The name of the proposal.
     */
    function name() public pure override returns (string memory) {
        return "Trustee Replacement Proposal Template";
    }

    /** A description of what the proposal does.
     */
    function description() public pure override returns (string memory) {
        return "Replaces as single trustee with another";
    }

    /** A URL where more details can be found.
     */
    function url() public pure override returns (string memory) {
        return
            "https://description.of.proposal make this link to a discussion of the no confidence vote";
    }

    /** Enact the proposal.
     *
     * This is executed in the storage context of the root policy contract.
     *
     * @param _self The address of the proposal.
     */
    function enacted(address _self) public override {
        bytes32 _trustedNodesId = keccak256(abi.encodePacked("TrustedNodes"));
        TrustedNodes _trustedNodes = TrustedNodes(policyFor(_trustedNodesId));

        address _oldTrustee = SingleTrusteeReplacement(_self).oldTrustee();
        address _newTrustee = SingleTrusteeReplacement(_self).newTrustee();

        _trustedNodes.distrust(_oldTrustee);
        _trustedNodes.trust(_newTrustee);
    }
}
