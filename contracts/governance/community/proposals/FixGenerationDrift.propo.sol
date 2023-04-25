// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import './Proposal.sol';

contract FixGenerationDrift is Proposal {

    address public immutable newTimedPolicies;

    address public immutable newCurrencyGovernance;
    
    address public immutable newPolicyProposals;

    constructor(
        address _newTimedPolicies,
        address _newCurrencyGovernance,
        address _newPolicyProposals
    ) {
        newTimedPolicies = _newTimedPolicies;
        newCurrencyGovernance = _newCurrencyGovernance;
        newPolicyProposals = _newPolicyProposals;
    }

    function name() public pure override returns (string memory) {
        return "Prevent Generation Drift";
    }

    function description() public pure override returns (string memory) {
        return "Pegging the start and end times of a given generation to those of the previous generation. This change also affects the start and end times of the first phase of both monetary and community governance.";
    }

    function url() public pure override returns (string memory) {
        return "";
    }

    function enacted(address) public override {
        // because ECOxStaking isn't proxied yet, we have to move over the identifier
        setPolicy(ECOxStakingIdentifier, newStaking, PolicyVotesIdentifier);

        address _ecoProxyAddr = policyFor(ECOIdentifier);

        Policed(_ecoProxyAddr).policyCommand(
            implementationUpdatingTarget,
            abi.encodeWithSignature("updateImplementation(address)", newECOImpl)
        );
    }

}