// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../../policy/Policy.sol";
import "../../../policy/Policed.sol";
import "./Proposal.sol";
import "../../../currency/ECO.sol";
import "../../../currency/ECOx.sol";

/** @title DeployRootPolicyFundw
 * A proposal to send some root policy funds to another
 * address (multisig, lockup, etc)
 */
contract AccessRootPolicyFunds is Policy, Proposal {
    address public immutable recipient;

    uint256 public immutable ecoAmount;

    uint256 public immutable ecoXAmount;

    string public name;

    string public description;

    string public url;

    constructor(
        address _recipient,
        uint256 _ecoAmount,
        uint256 _ecoXAmount,
        string memory _name,
        string memory _description,
        string memory _url
    ) {
        recipient = _recipient;
        ecoAmount = _ecoAmount;
        ecoXAmount = _ecoXAmount;
        name = _name;
        description = _description;
        url = _url;
    }

    function enacted(address) public override {
        bytes32 _ecoID = keccak256("ECO");
        ECO eco = ECO(policyFor(_ecoID));

        bytes32 _ecoXID = keccak256("ECOx");
        ECOx ecoX = ECOx(policyFor(_ecoXID));

        // if either ecoAmount or ecoXAmount are zero, parts related to that token should instead be removed
        eco.transfer(recipient, ecoAmount);
        ecoX.transfer(recipient, ecoXAmount);
    }
}
