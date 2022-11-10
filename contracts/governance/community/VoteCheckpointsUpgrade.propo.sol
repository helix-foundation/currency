// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../policy/Policy.sol";
import "./Proposal.sol";

/** @title VoteCheckpointsUpgrade
 *
 * A proposal to upgrade the ECO and ECOxStaking contract.
 */
contract VoteCheckpointsUpgrade is Policy, Proposal {
    /** The address of the contract to grant backdoor privileges to.
     */
    address public immutable newStaking;

    /** Instantiate a new proposal.
     *
     * @param _newStaking The address of the contract to mark as ECOxStaking.
     */
    constructor(address _newStaking) {
        newStaking = _newStaking;
    }

    /** The name of the proposal.
     */
    function name() public pure override returns (string memory) {
        return "VoteCheckpointsUpgrade";
    }

    /** A short description of the proposal.
     */
    function description() public pure override returns (string memory) {
        return "Change the ECO and ECOxStaking contract";
    }

    /** A URL where further details can be found.
     */
    function url() public pure override returns (string memory) {
        return "probably not using this";
    }

    /** Enact the proposal.
     *
     * This is run in the storage context of the root policy contract.
     */
    function enacted(address) public override {
      // because ECOxStaking isn't proxied yet, we just move over the identifier
      setPolicy(
          keccak256("ECOxStaking"),
          newStaking,
          keccak256("PolicyVotes")
      );
    }
}
