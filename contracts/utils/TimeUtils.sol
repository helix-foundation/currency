// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

/** @title TimeUtils
 * Utility class for time, allowing easy unit testing.
 */
contract TimeUtils {
    /** Determine the current time as perceived by the policy timing contract.
     *
     * Used extensively in testing, but also useful in production for
     * determining what processes can currently be run.
     */
    function getTime() internal view returns (uint256) {
        // solhint-disable-next-line not-rely-on-time
        return block.timestamp;
    }
}
