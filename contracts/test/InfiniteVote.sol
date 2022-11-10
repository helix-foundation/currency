// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "Subvoter.sol";
import "../governance/community/PolicyProposals.sol";
import "../governance/TimedPolicies.sol";
import "../policy/Policy.sol";


contract InfiniteVote{

    constructor(Subvoter[] placeholders){}

    function InfiniteVote(TimedPolicies timed, Policy policy){
        timed.incrementGeneration();
        PolicyProposal policyprops=policy.policyFor(keccak256("PolicyProposals"));
        policyprops.register();
    }

}