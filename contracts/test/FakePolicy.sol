// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./TestPolicy.sol";
import "../../contracts/currency/EcoBalanceStore.sol";

/** @title FakePolicy
 * A policy contract used to test various policy actions/permissions.
 */
contract FakePolicy is TestPolicy {
    /** Call authorize on the provided store with the provided policy
     * identifier.
     *
     * @param _store The store to act on.
     * @param _policy The policy parameter to provide.
     */
    function authorize(EcoBalanceStore _store, string calldata _policy)
        external
    {
        _store.authorize(_policy);
    }

    /** Call revoke on the provided store with the provided policy
     * identifier.
     *
     * @param _store The store to act on.
     * @param _policy The policy parameter to provide.
     */
    function revoke(EcoBalanceStore _store, string calldata _policy) external {
        _store.revoke(_policy);
    }

    /** Register an ERC1820 interface implementer for a given label.
     *
     * @param _label The interface identifier.
     * @param _impl The implementing address.
     */
    function setLabel(string calldata _label, address _impl) external {
        setInterfaceImplementation(_label, _impl);
    }

    /** Burn tokens in the provided store at the provided account.
     *
     * @param _store The store to act on.
     * @param _owner The account to operate on.
     * @param _amount The quantity of tokens to burn.
     */
    function burn(
        EcoBalanceStore _store,
        address _owner,
        uint256 _amount
    ) public {
        _store.tokenBurn(msg.sender, _owner, _amount, "", "");
    }
}
