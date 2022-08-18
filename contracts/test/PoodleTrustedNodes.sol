// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../governance/monetary/TrustedNodes.sol";

/** @title Template Upgrading Process
 *
 * This contract is used to show how the upgrade process can replace a proxied contract.
 * It only adds functionality to confirm that the contract is replaced. The underlying contract is
 * proxied to retain complex long term data. A change in the implementer of the ForwardProxy is all that's needed, however.
 */
contract PoodleTrustedNodes is TrustedNodes {
    // as the data is preserved on the proxy, the implementer needs no configuration, default values are passed
    constructor()
        TrustedNodes(
            Policy(0xDEADBEeFbAdf00dC0fFee1Ceb00dAFACEB00cEc0),
            new address[](0),
            0
        )
    {}

    function provePoodles() public pure returns (bool) {
        return true;
    }
}
