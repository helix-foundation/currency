/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../policy/PolicedUtils.sol";
import "../policy/Policy.sol";
import "../currency/EcoBalanceStore.sol";
import "../currency/ECOx.sol";

/** @title EcoTokenInit
 *
 * Initialize the Eco token. This policy should be instatiated with the
 * "CurrencyGovernance" permission, and is used to mint and distribute initial tokens.
 *
 * The addresses tokens are minted into and the quantities of tokens are set
 * based on the direction of the Eco executive team.
 *
 * As of 2019-02-21 the addresses here are suitable for testnet deployment only.
 */
contract EcoTokenInit is PolicedUtils {
    // solhint-disable-next-line no-empty-blocks
    constructor(address _policy) PolicedUtils(_policy) {}

    /** Mint initial tokens and remove permissions to prevent future calls.
     *
     * @param _store The address of the balance store to mint tokens in.
     */
    function initializeAndFuse(address _store, address _storeX) external {
        // EcoBalanceStore(_store).mint(
        //     0x79599DE87c2000b6aF219B37f7941E1Ab9b8E2d2,
        //     1000000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x6bAB1BD10Aa94431FF5d5bad537C93fCC2A78843,
        //     1150000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x6BFA48796115DFBA3005d5e14A0d1776cA4143c2,
        //     1190000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x39Be2F0d94b8a1f6a3d4FFFB996C6EDb62AF675f,
        //     1020000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x4D82E68a5e25C59Fa2A394676Ff309863E102dFA,
        //     1170000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x3aC84Fd4f17606811d3Dd12A7Af9329DC7f5597A,
        //     1150000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x386F1995345CA934b5121aF371314E677744e294,
        //     1170000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x4A2F5aDc7B0d732ea69258BcF19c22b00d8909e7,
        //     1040000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x5Dd3c3974256df9Ff663aCeF247A7702f79F5db3,
        //     1040000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0xaa4d88B87d99D68079bfE87b089877FE54eE78a1,
        //     1210000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0xE1A0d7F607c40e44A6E8908F2beC0f2080a1Eb11,
        //     1210000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x5db628E7Fa3C45E141c9292Cb2a5BbA12838fBea,
        //     1020000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0xca73c3de68578Bf1805602ac5B020F37A7df0746,
        //     1020000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x7f9a3C42201Ee1914D28a1A4bAE6F7929f8F79d6,
        //     1100000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x70D661Ea6F8D0889f621EEAd54468D9629787D93,
        //     1000000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x8AB4153427C627FACfD27339fC12ce418ef98BE2,
        //     1000000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0xF77E4a6382950b1b229f3767c87422eD9056AD30,
        //     1000000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x9183F7A4c14bE8dcA50b31e3a88671f03c4f1Fd4,
        //     1000000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x5a69d46FD8fb12284E32e970aA026BED41ef2fE3,
        //     1000000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x3005AcDDFD3ce10EE9F7E157d06CD09323Be216B,
        //     1000000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x657077342eba46bF9898eae27fcD83BF3f9Cb012,
        //     1000000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x94c4081c16e0bEEA9bd20362d8066c15fE2DF65B,
        //     1000000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x63f71665d3414AF2FC8b82f2F10105B5b14b1262,
        //     1000000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x9809a2e625126dF441eCD797b194B8f55c43AB6F,
        //     1000000000000000000000
        // );
        // EcoBalanceStore(_store).mint(
        //     0x877A2456190f077D583abC081431092F5c72fEB3,
        //     50000000000000000000000
        // );
        Policy(policy).removeSelf(ID_ECO_LABS);

        selfdestruct(payable(address(uint160(policy))));
    }
}
