// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../contracts/policy/ERC1820Client.sol";
import "@openzeppelin/contracts/utils/introspection/IERC1820Implementer.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777.sol";

/** @title ERC777EcoTokenAcceptingReceiver
 *
 * A contract implementing the ERC777TokensRecipient interface that always
 * accepts tokens sent to it, for a specific token contract.
 */
contract ERC777EcoTokenAcceptingReceiver is
    IERC777Recipient,
    ERC1820Client,
    IERC1820Implementer
{
    bytes32 internal constant ERC1820_ACCEPT_MAGIC =
        keccak256(abi.encodePacked("ERC1820_ACCEPT_MAGIC"));

    /** @dev The address of the token contract.
     */
    address internal tokenContract;

    /** An event used to ensure that the correct methods get called as
     * described in the ERC777 definition.
     *
     * Tests look for this event, which is emitted by tokensReceived.
     */
    event ReceivedERC777Call(
        address tokenContract,
        bytes userData,
        bytes operatorData
    );

    /** Construct a new token receiving contract using _tokenContract as the
     * address of the token contract. Optionally registers with ERC1820 as the
     * "ERC777TokensRecipient" implementation for itself.
     *
     * @param _tokenContract The address of the token contract.
     * @param register Register the contract with ERC1820?
     */
    constructor(address _tokenContract, bool register) {
        tokenContract = _tokenContract;
        if (register) {
            setInterfaceImplementation("ERC777TokensRecipient", address(this));
        }
    }

    /** The check method defined in ERC1820 to determine if this contract is
     * able to act as an interface on behalf of some other contract.
     *
     * This implementation only allows the instance to act on behalf of itself,
     * and only as an "ERC777TokensRecipient".
     *
     * @param _interfaceHash The interface being requested.
     * @param _addr The address to act on behalf of.
     */
    function canImplementInterfaceForAddress(
        bytes32 _interfaceHash,
        address _addr
    ) external view override returns (bytes32) {
        require(
            _interfaceHash == keccak256("ERC777TokensRecipient"),
            "Can only provide the tokens recipient interface"
        );
        require(address(this) == _addr, "Can only act on behalf of itself");
        return ERC1820_ACCEPT_MAGIC;
    }

    /** Handler to respond to the receipt of tokens.
     */
    function tokensReceived(
        address,
        address,
        address,
        uint256,
        bytes calldata _userData,
        bytes calldata _operatorData
    ) external override {
        if (msg.sender != tokenContract) {
            revert("only accepts ECO tokens!");
        }
        emit ReceivedERC777Call(msg.sender, _userData, _operatorData);
    }
}
