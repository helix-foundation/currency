// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TestPolicy.sol";

/** @title Killable
 * An interface describing contracts that provide the nullary destruct function.
 */
abstract contract Killable {
    function destruct() public virtual;
}

/** @title MurderousPolicy
 * A contract that extends policy and enables the killing of arbitrary victims.
 * Use for testing only.
 */
contract MurderousPolicy is TestPolicy {
    /** Call to have the murderous policy contract perform its dastardly deed
     * upon some hapless victim.
     *
     * Attempts to call the `destruct` function on the provided address.
     */
    function destruct(Killable _victim) public {
        _victim.destruct();
    }
}
