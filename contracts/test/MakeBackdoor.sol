// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../contracts/policy/Policy.sol";
import "../../contracts/governance/Proposal.sol";

/** @title MakeBackdoor
 *
 * A proposal to add a backdoor to a policy hierarchy.
 */
contract MakeBackdoor is Policy, Proposal {
    /** The address of the contract to grant backdoor privileges to.
     */
    address public who;

    /** Instantiate a new proposal.
     *
     * @param _who The address of the contract to grant privileges to.
     */
    constructor(address _who) public {
        who = _who;
    }

    /** The name of the proposal.
     */
    function name() public pure override returns (string memory) {
        return "MakeBackdoor";
    }

    /** A short description of the proposal.
     */
    function description() public pure override returns (string memory) {
        return "Give universal access to account";
    }

    /** A URL where further details can be found.
     */
    function url() public pure override returns (string memory) {
        return "https://description.of.proposal";
    }

    /** Enact the proposal.
     *
     * This is run in the storage context of the root policy contract.
     *
     * @param _self The address of the proposal instance.
     */
    function enacted(address _self) public override {
        address _who = MakeBackdoor(_self).who();
        setters.push("Backdoor");
        setInterfaceImplementation("Backdoor", _who);
    }
}
