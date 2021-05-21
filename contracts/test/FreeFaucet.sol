/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../../contracts/deploy/EcoFaucet.sol";

/** @title FreeFaucet
 *
 * Faucet that also mints out of thin air.
 */
contract FreeFaucet is EcoFaucet {
    // solhint-disable-next-line no-empty-blocks
    constructor(address _policy) public EcoFaucet(_policy) {}

    function mint(address _who, uint256 _amount) external {
        EcoBalanceStore(policyFor(ID_BALANCESTORE)).mint(_who, _amount);
    }

    function mintx(address _who, uint256 _amount) external {
        ECOx(policyFor(ID_ECOX)).mint(_who, _amount);
    }
}
