/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "../../contracts/policy/ERC1820Client.sol";
import "@openzeppelin/contracts/utils/introspection/IERC1820Implementer.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Sender.sol";

/** @title ERC777EcoTokenHolder
 *
 * A contract that holds and sends ERC777 tokens for testing.
 */
contract ERC777EcoTokenHolder is
    IERC777Sender,
    ERC1820Client,
    IERC1820Implementer
{
    bytes32 internal constant ERC1820_ACCEPT_MAGIC =
        keccak256(abi.encodePacked("ERC1820_ACCEPT_MAGIC"));

    /** @dev The address of the token contract.
     */
    address internal tokenContract;

    /** An event emitted to let tests determine that the tokensToSend method has
     * been called.
     */
    event ReceivedERC777Call(
        address tokenContract,
        bytes userData,
        bytes operatorData
    );

    /** Construct a new token holder contract for testing. Optionally registers
     * the contract with the ERC1820 registry.
     *
     * @param _tokenContract The address of the token contract.
     * @param register Register the contract with ERC1820?
     */
    constructor(address _tokenContract, bool register) {
        tokenContract = _tokenContract;
        if (register) {
            setInterfaceImplementation("ERC777TokensSender", address(this));
        }
    }

    /** The check method defined in ERC1820 to determine if this contract is
     * able to act as an interface on behalf of some other contract.
     *
     * This implementation only allows the instance to act on behalf of itself,
     * and only as an "ERC777TokensSender".
     *
     * @param _interfaceHash The interface being requested.
     */
    function canImplementInterfaceForAddress(bytes32 _interfaceHash, address)
        external
        pure
        override
        returns (bytes32)
    {
        require(
            _interfaceHash == keccak256("ERC777TokensSender"),
            "Can only provide the token sender interface"
        );
        return ERC1820_ACCEPT_MAGIC;
    }

    /** Handler to respond to a token send action.
     *
     * Always permits the action.
     */
    function tokensToSend(
        address,
        address,
        address,
        uint256,
        bytes calldata _userData,
        bytes calldata _operatorData
    ) external override {
        emit ReceivedERC777Call(tokenContract, _userData, _operatorData);
    }
}
