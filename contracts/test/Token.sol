// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../currency/ERC20.sol";
import "../policy/PolicedUtils.sol";

/** @title Token
 *
 * A token contract used for testing transfer functionalities.
 */
contract Token is ERC20, PolicedUtils {
    /** Construct a new token referencing the provided root policy and
     * balance store.
     *
     * @param _policy The root policy address.
     */
    constructor(address _policy) ERC20("Test", "TEST") PolicedUtils(_policy) {}
}
