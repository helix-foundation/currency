// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../policy/Policy.sol";
import "../policy/PolicyInit.sol";
import "../proxy/ForwardProxy.sol";
import "@openzeppelin/contracts/utils/introspection/IERC1820Implementer.sol";

/** @title TestPolicy
 * A policy used for testing interface-setting functionalities.
 */
contract TestPolicy is Policy, IERC1820Implementer {
    bytes32 internal constant ERC1820_ACCEPT_MAGIC =
        keccak256("ERC1820_ACCEPT_MAGIC");

    /** This policy is used for testing only, so it offers to implement any
     * interface for any address. Arguments are ignored.
     */
    function canImplementInterfaceForAddress(bytes32, address)
        external
        pure
        override
        returns (bytes32)
    {
        return ERC1820_ACCEPT_MAGIC;
    }
}
