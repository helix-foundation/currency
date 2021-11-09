/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "./Policy.sol";
import "./PolicedUtils.sol";

/** @title Policy initialization contract
 *
 * This contract is used to configure a policy contract immediately after
 * construction as the target of a proxy. It sets up permissions for other
 * contracts and makes future initialization impossible.
 */
contract PolicyInit is Policy {
    /** Initialize and fuse future initialization of a policy contract
     *
     * @param _policy The address of the policy contract to replace this one.
     * @param _setters The interface identifiers for privileged contracts. The
     *                 contracts registered at these identifiers will be able to
     *                 execute code in the context of the policy contract.
     * @param _keys The identifiers for associated governance contracts.
     * @param _values The addresses of associated governance contracts (must
     *                align with _keys).
     * @param _tokenResolvers Identifiers for token contracts
     */
    function fusedInit(
        address _policy,
        bytes32[] calldata _setters,
        bytes32[] calldata _keys,
        address[] calldata _values,
        bytes32[] calldata _tokenResolvers
    ) external {
        require(
            _keys.length == _values.length,
            "_keys and _values must correspond exactly (length)"
        );

        setImplementation(_policy);
        setters = _setters;
        // This contract is for internal ECO use only,
        // loops boundaries are reasonable.
        for (uint256 i = 0; i < _keys.length; ++i) {
            ERC1820REGISTRY.setInterfaceImplementer(
                address(this),
                _keys[i],
                _values[i]
            );
        }

        for (uint256 i = 0; i < _tokenResolvers.length; ++i) {
            PolicedUtils a = PolicedUtils(
                ERC1820REGISTRY.getInterfaceImplementer(
                    address(this),
                    _tokenResolvers[i]
                )
            );
            for (uint256 j = 0; j < _tokenResolvers.length; ++j) {
                PolicedUtils b = PolicedUtils(
                    ERC1820REGISTRY.getInterfaceImplementer(
                        address(this),
                        _tokenResolvers[j]
                    )
                );

                a.setExpectedInterfaceSet(address(b));
                ERC1820REGISTRY.setInterfaceImplementer(
                    address(b),
                    _tokenResolvers[i],
                    address(a)
                );
            }
            a.setExpectedInterfaceSet(address(0));
        }
    }

    /** Initialize the contract (replaces constructor)
     *
     * See the documentation for Policy to understand this.
     *
     * @param _self The address of the original contract deployment (as opposed
     *              to the address of the proxy contract, which takes the place
     *              of `this`).
     */
    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
    }
}
