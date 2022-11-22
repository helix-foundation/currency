// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "./TrusteeReplacement.propo.sol";

/** @title FirstTrusteeElection
 * A proposal to elect the first cohort of trustees and fund the
 * TrustedNodes contract to pay them out
 */
contract FirstTrusteeElection is TrusteeReplacement {
    /* amount of ECOx allocated for year 1 trustee payouts
     */
    uint256 public constant firstYearFunding = 4750000e18;

    constructor(address[] memory _newTrustees)
        TrusteeReplacement(_newTrustees)
    {
        // uses TrusteeReplacement constructor
    }

    function name() public pure override returns (string memory) {
        return "First Trustee Election Proposal Template";
    }

    function description() public pure override returns (string memory) {
        return
            "Appoints this list of trustees as the first cohort and allocates their rewards";
    }

    function enacted(address _self) public override {
        bytes32 _trustedNodesId = keccak256("TrustedNodes");
        bytes32 _ecoXID = keccak256("ECOx");

        TrustedNodes _trustedNodes = TrustedNodes(policyFor(_trustedNodesId));
        ECOx ecoX = ECOx(policyFor(_ecoXID));

        address[] memory _newTrustees = TrusteeReplacement(_self)
            .returnNewTrustees();
        _trustedNodes.newCohort(_newTrustees);

        ecoX.transfer(address(_trustedNodes), firstYearFunding);
    }
}
