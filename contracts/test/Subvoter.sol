// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../currency/ECO.sol";
import "../governance/community/PolicyProposals.sol";
import "../governance/community/PolicyVotes.sol";
import "../governance/community/Proposal.sol";

contract Subvoter{

    ECO public immutable ecoaddress;

    constructor(ECO _ecoaddress){
        ecoaddress = _ecoaddress;
    }

    function votePolicy(PolicyProposals _proposals, address _proposalToSupport) public {
        _proposals.support(Proposal(_proposalToSupport));
        ecoaddress.transfer(msg.sender, ecoaddress.balanceOf(address(this)));
    }

    function voteVotes(PolicyVotes _votes) public {
        _votes.vote(true);
        ecoaddress.transfer(msg.sender, ecoaddress.balanceOf(address(this)));
    }

}