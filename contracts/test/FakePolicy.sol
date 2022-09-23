// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./TestPolicy.sol";
import "../currency/IECO.sol";

/** @title FakePolicy
 * A policy contract used to test various policy actions/permissions.
 */
contract FakePolicy is TestPolicy {
    /** Register an ERC1820 interface implementer for a given label.
     *
     * @param _label The interface identifier.
     * @param _impl The implementing address.
     */
    function setLabel(string calldata _label, address _impl) external {
        ERC1820REGISTRY.setInterfaceImplementer(
            address(this),
            keccak256(bytes(_label)),
            _impl
        );
    }

    /** Mint tokens in the provided store at the provided account.
     *
     * @param _store The store to act on.
     * @param _owner The account to operate on.
     * @param _amount The quantity of tokens to mint.
     */
    function mint(
        IECO _store,
        address _owner,
        uint256 _amount
    ) public {
        _store.mint(_owner, _amount);
    }
}
