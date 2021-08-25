// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../../contracts/policy/Policy.sol";
import "../../contracts/currency/EcoBalanceStore.sol";
import "../../contracts/governance/Proposal.sol";

/** @title MakeRich
 * A proposal to mint new currency into a particular account, making the account
 * owner rich.
 */
contract MakeRich is Policy, Proposal {
    /** The address of the account to mint tokens into.
     */
    address public account;

    /** The amount of tokens to mint.
     */
    uint256 public amount;

    /** Instantiate a new proposal.
     *
     * @param _account The account to mint tokens into.
     * @param _amount The amount of tokens to mint.
     */
    constructor(address _account, uint256 _amount) public {
        account = _account;
        amount = _amount;
    }

    /** The name of the proposal.
     */
    function name() public pure override returns (string memory) {
        return "MakeRich";
    }

    /** A description of what the proposal does.
     */
    function description() public pure override returns (string memory) {
        return "Make accounts[3] very happy";
    }

    /** A URL where more details can be found.
     */
    function url() public pure override returns (string memory) {
        return "https://description.of.proposal";
    }

    /** Enact the proposal.
     *
     * This is executed in the storage context of the root policy contract.
     *
     * @param _self The address of the proposal.
     */
    function enacted(address _self) public override {
        bytes32 _inflationId = keccak256(
            abi.encodePacked("CurrencyGovernance")
        );
        bytes32 _storeId = keccak256(abi.encodePacked("BalanceStore"));

        address _account = MakeRich(_self).account();
        uint256 _amount = MakeRich(_self).amount();

        // The token has security allowing only 'Inflation' to mint,
        // but right now we're executing with absolute privileges
        // so just impersonate *being* Inflation

        // Another alternative is to policyCommand inflation to
        // call the mint() function

        address _old = policyFor(_inflationId);
        setInterfaceImplementation("CurrencyGovernance", address(this));

        EcoBalanceStore _store = EcoBalanceStore(policyFor(_storeId));
        _store.mint(_account, _amount);

        setInterfaceImplementation("CurrencyGovernance", _old);
    }
}
