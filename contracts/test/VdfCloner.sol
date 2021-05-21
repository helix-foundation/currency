// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../../contracts/VDF/VDFVerifier.sol";

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
    constructor(address _addr) public {
        clone = VDFVerifier(VDFVerifier(_addr).clone());
    }

    function destruct() public {
        clone.destruct();
    }
}
