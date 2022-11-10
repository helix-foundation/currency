pragma solidity ^0.8.0;

import "../currency/ECO.sol";
import "../governance/community/PolicyProposals.sol";
import "../governance/community/PolicyVotes.sol";

contract Subvoter{

    constructor(Eco _ecoaddress){}

    function votePolicy(PolicyProposals _proposals, address proposaladdress) public {
        _proposals.support(proposaladdress);
        _ecoaddress.transfer(msg.sender);
    }

    function voteVotes(PolicyVotes _votes) public {
        _proposals.vote(true);
        _ecoaddress.transfer(msg.sender);
    }

}