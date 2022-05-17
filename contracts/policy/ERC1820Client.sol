// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";

/** @title Utilities for interfacing with ERC1820
 */
abstract contract ERC1820Client {
    IERC1820Registry internal constant ERC1820REGISTRY =
        IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);

    /** IERC1820 lookup */
    function interfaceAddr(address _addr, string memory _interfaceLabel)
        internal
        view
        returns (address)
    {
        return
            ERC1820REGISTRY.getInterfaceImplementer(
                _addr,
                keccak256(abi.encodePacked(_interfaceLabel))
            );
    }

    /** IERC1820 setter */
    function setInterfaceImplementation(
        string memory _interfaceLabel,
        address _implementation
    ) internal {
        ERC1820REGISTRY.setInterfaceImplementer(
            address(this),
            keccak256(abi.encodePacked(_interfaceLabel)),
            _implementation
        );
    }
}
