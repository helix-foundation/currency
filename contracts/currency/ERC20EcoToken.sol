/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../policy/PolicedUtils.sol";
import "./EcoBalanceStore.sol";
import "./TokenPrototype.sol";

/** @title An ERC20 token interface to the Eco currency syste4m.
 */
contract ERC20EcoToken is TokenPrototype, IERC20 {
    using SafeMath for uint256;

    /** Tracks allowances for each user from each other user.
     *  The parameter is in basic unit of 10^{-18} (atto) ECO tokens
     */
    mapping(address => mapping(address => uint256)) public allowances;

    // solhint-disable-next-line no-empty-blocks
    constructor(address _policy) public TokenPrototype(_policy) {}

    /** Return the friendly name of the ERC20 token.
     */
    function name() external view returns (string memory) {
        return store.name();
    }

    /** Return the exchange symbol of the ERC20 token.
     */
    function symbol() external view returns (string memory) {
        return store.symbol();
    }

    /** Return the number of digits to the right of the decimal point for the
     * ERC20 token.
     */
    function decimals() external view returns (uint8) {
        return store.decimals();
    }

    /** Return the total quantity of token in existence.
     */
    function totalSupply() external view override returns (uint256) {
        return store.tokenSupply();
    }

    /** Get the balance of a specific address.
     */
    function balanceOf(address _address)
        external
        view
        override
        returns (uint256)
    {
        return store.balance(_address);
    }

    /** Transfer tokens from the caller's address to another address.
     */
    function transfer(address _to, uint256 _value)
        external
        override
        returns (bool)
    {
        if (_to == address(0)) {
            store.tokenBurn(_msgSender(), _msgSender(), _value, "", "");
        } else {
            store.tokenTransfer(
                _msgSender(),
                _msgSender(),
                _to,
                _value,
                "",
                ""
            );
        }
        return true;
    }

    /** Transfer tokens from one address to another.
     *
     * Caller must have been previously approved to do so.
     */
    function transferFrom(
        address _from,
        address _to,
        uint256 _value
    ) external override returns (bool) {
        require(
            allowances[_from][_msgSender()] >= _value,
            "Insufficient allowance for transfer"
        );
        allowances[_from][_msgSender()] = allowances[_from][_msgSender()].sub(
            _value
        );
        if (_to == address(0)) {
            store.tokenBurn(_msgSender(), _from, _value, "", "");
        } else {
            store.tokenTransfer(_msgSender(), _from, _to, _value, "", "");
        }
        return true;
    }

    /** Approve an address to transfer tokens on behalf of the caller.
     */
    function approve(address _spender, uint256 _value)
        external
        override
        returns (bool)
    {
        allowances[_msgSender()][_spender] = _value;
        emit Approval(_msgSender(), _spender, _value);
        return true;
    }

    /** Check how much value one address is allowed to transfer on behalf of
     * another.
     */
    function allowance(address _owner, address _spender)
        external
        view
        override
        returns (uint256)
    {
        return allowances[_owner][_spender];
    }

    function emitSentEvent(
        address,
        address _from,
        address _to,
        uint256 _amount,
        bytes calldata,
        bytes calldata
    ) external override onlyStore {
        emit Transfer(_from, _to, _amount);
    }

    function emitMintedEvent(
        address,
        address _to,
        uint256 _amount,
        bytes calldata,
        bytes calldata
    ) external override onlyStore {
        emit Transfer(address(0), _to, _amount);
    }

    function emitBurnedEvent(
        address,
        address _from,
        uint256 _amount,
        bytes calldata,
        bytes calldata
    ) external override onlyStore {
        emit Transfer(_from, address(0), _amount);
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
}
