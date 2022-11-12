// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../currency/ECO.sol";

/** @title Proxy Upgrading Process
 *
 * This contract is used to show how the upgrade process can replace a proxied contract.
 * It only adds functionality to confirm that the contract is replaced. The underlying contract is
 * proxied to retain complex long term data. A change in the implementer of the ForwardProxy is all that's needed, however.
 */
contract PoodleECO is ECO {
    constructor(Policy _policy)
        ECO(_policy, address(1), 2, address(3))
    {
      // the distributor and initial supply are unneeded going forward, but could be preserved (are immutable)
      // the initial pauser is a mutable variable and therefore is already in storage for the proxy
      // setting the value here proves that the initialize function isn't called to clobber the previous pauser
    }

    function provePoodles() public pure returns (bool) {
        return true;
    }
}
