// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../../contracts/policy/Policy.sol";
import "../../contracts/currency/IECO.sol";
import "../../contracts/governance/community/Proposal.sol";

/** @title MakeRich
 * A proposal to mint new currency into a particular account, making the account
 * owner rich.
 */
contract MakeRich is Policy, Proposal {
    /** The address of the account to mint tokens into.
     */
    address public immutable account;

    /** The amount of tokens to mint.
     */
    uint256 public immutable amount;

    /** Instantiate a new proposal.
     *
     * @param _account The account to mint tokens into.
     * @param _amount The amount of tokens to mint.
     */
    constructor(address _account, uint256 _amount) {
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

    /** Enact the proposal. Mint a bunch of coins for the lucky account.
     *
     * This is executed in the storage context of the root policy contract.
     */
    function enacted(address) public override {
        bytes32 _inflationId = keccak256(abi.encodePacked("EcoLabs"));
        bytes32 _ecoId = keccak256(abi.encodePacked("ECO"));

        // The token has security allowing only 'Inflation' to mint,
        // but right now we're executing with absolute privileges
        // so just impersonate *being* Inflation

        // Another alternative is to policyCommand inflation to
        // call the mint() function

        address _old = policyFor(_inflationId);
        setPolicy(
            keccak256("EcoLabs"),
            address(this),
            keccak256("PolicyVotes")
        );

        IECO _eco = IECO(policyFor(_ecoId));
        _eco.mint(account, amount);

        setPolicy(keccak256("EcoLabs"), _old, keccak256("PolicyVotes"));
    }
}
