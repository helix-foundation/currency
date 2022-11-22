// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../../policy/Policy.sol";
import "../../../policy/Policed.sol";
import "./Proposal.sol";
import "../../../currency/ECO.sol";
import "../../../currency/ECOx.sol";
import "../../../governance/monetary/CurrencyGovernance.sol";
import "../../../governance/CurrencyTimer.sol";

/**
 * @title ElectCircuitBreaker
 * A proposal to elect an admin that can pause parts of the system.
 */
contract ElectCircuitBreaker is Policy, Proposal {
    // the new address that can call circuit breaker functions
    address public immutable pauser;

    /**
     * Instantiate a new proposal.
     *
     * @param _pauser The new admin address
     */
    constructor(address _pauser) {
        pauser = _pauser;
    }

    /**
     * The name of the proposal.
     */
    function name() public pure override returns (string memory) {
        return "Circuit Breaker Election Proposal Template";
    }

    /**
     * A description of what the proposal does.
     */
    function description() public pure override returns (string memory) {
        return
            "Elects a new admin address that can call circuit breaker functions";
    }

    /**
     * A URL where more details can be found.
     */
    function url() public pure override returns (string memory) {
        return
            "https://description.of.proposal make this link to a discussion of the new circuit breaker";
    }

    /**
     * Enact the proposal.
     *
     * This is executed in the storage context of the root policy contract.
     */
    function enacted(
        address // _self,
    ) public override {
        bytes32 _ecoId = keccak256("ECO");
        bytes32 _ecoxId = keccak256("ECOx");
        bytes32 _currencyGovernanceId = keccak256("CurrencyGovernance");
        bytes32 _currencyTimerId = keccak256("CurrencyTimer");

        ECO eco = ECO(policyFor(_ecoId));
        ECOx ecox = ECOx(policyFor(_ecoxId));
        CurrencyGovernance currencyGovernance = CurrencyGovernance(
            policyFor(_currencyGovernanceId)
        );
        CurrencyTimer currencyTimer = CurrencyTimer(
            policyFor(_currencyTimerId)
        );

        eco.setPauser(pauser);
        ecox.setPauser(pauser);
        currencyGovernance.setPauser(pauser);
        CurrencyGovernance(currencyTimer.bordaImpl()).setPauser(pauser);
    }
}
