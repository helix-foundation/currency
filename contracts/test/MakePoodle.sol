// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../contracts/policy/Policy.sol";
import "../../contracts/policy/Policed.sol";
import "../../contracts/governance/Proposal.sol";

/** @title MakePoodle
 * A proposal to add a new voting parameter to CurrencyGovernance.sol
 */
contract MakePoodle is Policy, Proposal {
    /** The address of the updated CurrencyGovernance contract
     */
    address public newGovernance;

    /** The address of the switcher contract for CurrencyTimer
     */
    address public switcherCurrencyTimer;

    /** Instantiate a new proposal.
     *
     * @param _newGovernance The address of the updated CurrencyGovernance contract
     */
    constructor(address _newGovernance, address _switcherCurrencyTimer) public {
        newGovernance = _newGovernance;
        switcherCurrencyTimer = _switcherCurrencyTimer;
    }

    /** The name of the proposal.
     */
    function name() public pure override returns (string memory) {
        return "MakePoodle";
    }

    /** A description of what the proposal does.
     */
    function description() public pure override returns (string memory) {
        return "Make Trustees vote on the number of Poodles";
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
        bytes32 _currencyTimerId = keccak256(abi.encodePacked("CurrencyTimer"));
        address _currencyTimer = policyFor(_currencyTimerId);

        address _newGovernance = MakePoodle(_self).newGovernance();
        address _switcherCurrencyTimer = MakePoodle(_self)
            .switcherCurrencyTimer();

        Policed(_currencyTimer).policyCommand(
            _switcherCurrencyTimer,
            abi.encodeWithSignature("setBordaImpl(address)", _newGovernance)
        );
    }
}
