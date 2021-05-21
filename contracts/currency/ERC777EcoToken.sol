/* -*- mode: solidity; c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Sender.sol";

import "../policy/PolicedUtils.sol";
import "./EcoBalanceStore.sol";
import "./TokenPrototype.sol";

/** @title An ERC777 interface to the Eco currency.
 *
 * This provides an ERC777 interface on top of the EcoBalanceStore, and is
 * intended for deployment. The interface is specified at
 * https://eips.ethereum.org/EIPS/eip-777
 *
 * A reference token implementation can be found at
 * https://github.com/0xjac/ERC777/tree/master
 */
contract ERC777EcoToken is TokenPrototype, IERC777 {
    mapping(address => mapping(address => bool)) public operators;

    // solhint-disable-next-line no-empty-blocks
    constructor(address _policy) public TokenPrototype(_policy) {}

    /** Return the friendly name of the ERC777 token.
     */
    function name() external view override returns (string memory) {
        return store.name();
    }

    /** Return the exchange symbol of the ERC777 token.
     */
    function symbol() public view override returns (string memory) {
        return store.symbol();
    }

    /** Granularity defines what the smallest transferrable unit of the token
     * is. The parameter is in basic unit of 10^{-18} (atto) ECO tokens.
     */
    function granularity() public pure override returns (uint256) {
        return 1;
    }

    /** Return the total quantity of token in existence.
     */
    function totalSupply() public view override returns (uint256) {
        return store.tokenSupply();
    }

    /** Get the balance of a specific address.
     */
    function balanceOf(address _owner) public view override returns (uint256) {
        return store.balance(_owner);
    }

    /** Transfer tokens from the caller's address to another address.
     */
    function send(
        address _to,
        uint256 _amount,
        bytes memory _data
    ) public override {
        doSend(_msgSender(), _msgSender(), _to, _amount, _data, "");
    }

    /** Return the list of default operators
     */
    function defaultOperators()
        public
        pure
        override
        returns (address[] memory)
    {
        address[] memory m;
        return m;
    }

    /** Authorize another address to act on behalf of the calling address.
     */
    function authorizeOperator(address _operator) public override {
        require(
            _msgSender() != _operator,
            "Can't authorize yourself as an operator."
        );
        operators[_msgSender()][_operator] = true;
        emit AuthorizedOperator(_operator, _msgSender());
    }

    /** Revoke a previous authorization of another address to act on behalf of
     * the calling address.
     */
    function revokeOperator(address _operator) public override {
        require(
            _msgSender() != _operator,
            "Can't revoke account holder as an operator."
        );
        operators[_msgSender()][_operator] = false;
        emit RevokedOperator(_operator, _msgSender());
    }

    /** Check the authorization status of an address to act on behalf of
     * another address.
     */
    function isOperatorFor(address _operator, address _owner)
        public
        view
        override
        returns (bool)
    {
        return (_operator == _owner || operators[_owner][_operator]);
    }

    /** Transfer tokens from the one address to another address.
     */
    function operatorSend(
        address _from,
        address _to,
        uint256 _amount,
        bytes memory _userData,
        bytes memory _operatorData
    ) public override {
        require(
            isOperatorFor(_msgSender(), _from),
            "Only an authorized operator may use this feature."
        );
        doSend(_msgSender(), _from, _to, _amount, _userData, _operatorData);
    }

    function burn(uint256 _amount, bytes calldata _data) external override {
        store.tokenBurn(_msgSender(), _msgSender(), _amount, _data, "");
    }

    function operatorBurn(
        address _tokenHolder,
        uint256 _amount,
        bytes calldata _data,
        bytes calldata _operatorData
    ) external override {
        require(isOperatorFor(_msgSender(), _tokenHolder), "Not an operator");
        store.tokenBurn(
            _msgSender(),
            _tokenHolder,
            _amount,
            _data,
            _operatorData
        );
    }

    function emitSentEvent(
        address _operator,
        address _from,
        address _to,
        uint256 _amount,
        bytes calldata _data,
        bytes calldata _operatorData
    ) external override onlyStore {
        emit Sent(_operator, _from, _to, _amount, _data, _operatorData);
    }

    function emitMintedEvent(
        address _operator,
        address _to,
        uint256 _amount,
        bytes calldata _data,
        bytes calldata _operatorData
    ) external override onlyStore {
        emit Minted(_operator, _to, _amount, _data, _operatorData);
    }

    function emitBurnedEvent(
        address _operator,
        address _from,
        uint256 _amount,
        bytes calldata _data,
        bytes calldata _operatorData
    ) external override onlyStore {
        emit Burned(_operator, _from, _amount, _data, _operatorData);
    }

    /** Allow the cleanup policy provider to self-destruct the contract.
     */
    function destruct() external {
        require(
            _msgSender() == policyFor(ID_CLEANUP),
            "Only the cleanup policy contract can call destruct."
        );
        selfdestruct(_msgSender());
    }

    /** Utility function to perform the transfer of tokens from one address to another.
     */
    function doSend(
        address _operator,
        address _from,
        address _to,
        uint256 _amount,
        bytes memory _userData,
        bytes memory _operatorData
    ) private {
        require(_to != address(0), "Cannot send to 0x0");
        callSender(_operator, _from, _to, _amount, _userData, _operatorData);
        store.tokenTransfer(
            _operator,
            _from,
            _to,
            _amount,
            _userData,
            _operatorData
        );
        callRecipient(_operator, _from, _to, _amount, _userData, _operatorData);
    }

    /** If the the _from address is a contract address then call a function to
     * on the _from address to allow it to react to an upcoming currency
     * transfer.
     */
    function callSender(
        address _operator,
        address _from,
        address _to,
        uint256 _amount,
        bytes memory _userData,
        bytes memory _operatorData
    ) private {
        address impl = interfaceAddr(_from, "ERC777TokensSender");
        if (impl != address(0)) {
            IERC777Sender(impl).tokensToSend(
                _operator,
                _from,
                _to,
                _amount,
                _userData,
                _operatorData
            );
        }
    }

    /** If the _to address is a contract address then call a function on the _to
     * address to allow it to react to a currency transfer.
     */
    function callRecipient(
        address _operator,
        address _from,
        address _to,
        uint256 _amount,
        bytes memory _userData,
        bytes memory _operatorData
    ) private {
        address impl = interfaceAddr(_to, "ERC777TokensRecipient");
        if (impl != address(0)) {
            IERC777Recipient(impl).tokensReceived(
                _operator,
                _from,
                _to,
                _amount,
                _userData,
                _operatorData
            );
        } else {
            require(
                !isContract(_to),
                "Contract recipients must provide an ERC1820 interface definition for ERC777TokensRecipient."
            );
        }
    }

    /** Utility function to figure out if a caller is a contract.
     *
     * This breaks down badly when called from a contract constructor.
     */
    function isContract(address _addr) private view returns (bool) {
        uint256 size;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            size := extcodesize(_addr)
        }
        return size > 0;
    }
}
