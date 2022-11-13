// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./Subvoter.sol";
import "../currency/ECO.sol";
import "../governance/community/PolicyProposals.sol";
import "../governance/community/PolicyVotes.sol";
import "../governance/community/Proposal.sol";
import "../governance/TimedPolicies.sol";
import "../policy/Policy.sol";

contract InfiniteVote {
    Subvoter[] public subvoters;

    uint256 public immutable NUM_SUBVOTERS;

    uint256 public constant COST_REGISTER = 10000e18;

    address public immutable PROPOSAL;

    ECO public immutable ecoaddress;

    constructor(
        uint256 _num_subvoters,
        ECO _ecoaddress,
        address _proposal
    ) {
        NUM_SUBVOTERS = _num_subvoters;
        ecoaddress = _ecoaddress;
        PROPOSAL = _proposal;

        for (uint256 i = 0; i < (NUM_SUBVOTERS * 11) / 3; i++) {
            subvoters.push(new Subvoter(ecoaddress));
        }
    }

    function infiniteVote(TimedPolicies timed, Policy policy) external {
        timed.incrementGeneration();
        PolicyProposals policyprops = PolicyProposals(
            policy.policyFor(keccak256("PolicyProposals"))
        );
        ecoaddress.approve(address(policyprops), COST_REGISTER);
        policyprops.registerProposal(Proposal(PROPOSAL));
        for (uint256 i = 0; i < NUM_SUBVOTERS; i++) {
            ecoaddress.transfer(
                address(subvoters[i]),
                ecoaddress.balanceOf(address(this))
            );
            subvoters[i].votePolicy(policyprops, PROPOSAL);
        }
        policyprops.deployProposalVoting();
        PolicyVotes policyvotes = PolicyVotes(
            policy.policyFor(keccak256("PolicyVotes"))
        );
        for (uint256 i = 0; i < (NUM_SUBVOTERS * 11) / 3; i++) {
            ecoaddress.transfer(
                address(subvoters[i]),
                ecoaddress.balanceOf(address(this))
            );
            subvoters[i].voteVotes(policyvotes);
        }
    }
}
