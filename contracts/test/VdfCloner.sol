// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../VDF/VDFVerifier.sol";

/** @title VdfCloner
 *
 * A test contract that clones the given VDF contract.
 */
contract VdfCloner {
    /** The address of the cloned contract.
     */
    VDFVerifier public clone;

    /** Construct a new contract and clone the provided contract.
     *
     * @param _addr The address of the contract to clone.
     */
    constructor(address _addr) {
        clone = VDFVerifier(VDFVerifier(_addr).clone());
    }
}
