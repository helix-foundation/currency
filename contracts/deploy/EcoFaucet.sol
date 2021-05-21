/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../policy/PolicedUtils.sol";
import "../currency/EcoBalanceStore.sol";
import "../currency/ECOx.sol";

/** @title EcoFaucet
 *
 * The Faucet contract provides a way to exchange ETH for Eco tokens. It should
 * only be deployed on the testnet. The contract requires the "Faucet"
 * permission in the policy system, which allows it to mint new tokens.
 */
contract EcoFaucet is PolicedUtils {
    // solhint-disable-next-line no-empty-blocks
    constructor(address _policy) public PolicedUtils(_policy) {}

    /** Exchange ETH for an equivalent amount of Eco tokens.
     *
     * The exchange rate used is 1:1 - 1 szabo ETH will get you 1 szabo of eco.
     */
    function faucet() external payable returns (uint256) {
        EcoBalanceStore(policyFor(ID_BALANCESTORE)).mint(
            _msgSender(),
            msg.value
        );
        return msg.value;
    }

    /** Exchange ETH for an equivalent amount of EcoX tokens.
     *
     * The exchange rate used is 1:1 - 1 szabo ETH will get you 1 szabo of eco.
     */
    function faucetX() external payable returns (uint256) {
        ECOx(policyFor(ID_ECOX)).mint(_msgSender(), msg.value);
        return msg.value;
    }
}
