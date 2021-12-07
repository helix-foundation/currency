/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../policy/PolicedUtils.sol";
import "../currency/EcoBalanceStore.sol";
import "../currency/ECOx.sol";

/** @title EcoFaucet
 *
 * Faucet that also mints out of thin air. It should
 * only be deployed on the testnet. The contract requires the "Faucet"
 * permission in the policy system, which allows it to mint new tokens.
 */
contract EcoFaucet is PolicedUtils {
    // solhint-disable-next-line no-empty-blocks
    constructor(address _policy) PolicedUtils(_policy) {}

    function mint(address _who, uint256 _amount) external {
        EcoBalanceStore(policyFor(ID_ERC20TOKEN)).mint(_who, _amount);
    }

    function mintx(address _who, uint256 _amount) external {
        ECOx(policyFor(ID_ECOX)).mint(_who, _amount);
    }
}
