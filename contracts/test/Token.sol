// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../contracts/currency/TokenPrototype.sol";
import "../../contracts/currency/EcoBalanceStore.sol";

/** @title Token
 *
 * A token contract used for testing transfer functionalities.
 */
contract Token is TokenPrototype {
    /** Construct a new token referencing the provided root policy and
     * balance store.
     *
     * @param _policy The root policy address.
     * @param _store The balance store address.
     */
    constructor(address _policy, address _store)
        public
        TokenPrototype(_policy)
    {
        store = EcoBalanceStore(_store);
    }

    /** Transfer tokens using the token interface's permissions.
     *
     * @param _from The account to debit.
     * @param _to The account to credit.
     * @param _value The quantity of tokens to move.
     */
    function transfer(
        address _from,
        address _to,
        uint256 _value
    ) public {
        store.tokenTransfer(msg.sender, _from, _to, _value, "", "");
    }

    function emitSentEvent(
        address _operator,
        address _from,
        address _to,
        uint256 _amount,
        bytes calldata _data,
        bytes calldata _operatorData
    ) external override {}

    function emitMintedEvent(
        address _operator,
        address _to,
        uint256 _amount,
        bytes calldata _data,
        bytes calldata _operatorData
    ) external override {}

    function emitBurnedEvent(
        address _operator,
        address _from,
        uint256 _amount,
        bytes calldata _data,
        bytes calldata _operatorData
    ) external override {}
}
