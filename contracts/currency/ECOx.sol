/* -*- c-basic-offset: 4 -*- */
// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../policy/PolicedUtils.sol";
import "../utils/TimeUtils.sol";
import "./TokenEvents.sol";
import "./GenerationStore.sol";
import "./EcoBalanceStore.sol";
import "../governance/Lockup.sol";
import "../governance/CurrencyTimer.sol";

/** @title ECOx
 * TODO: Update doc
 * This implements a shared balance store to be used by the ECO network to
 * store token account balances in a way that is sharable across multiple token
 * interface definitions.
 *
 * Only pre-authorized interface contract instances are permitted to interact
 * with this contract. These instances are authorized by the balance store
 * contract policy, and their access can be revoked by the policy at any time.
 *
 * This contract does not represent a token by itself! It only makes sense in
 * the context of an interface, presumably implementing a widely accepted token
 * contract standard, ie ERC20.
 */
contract ECOx is GenerationStore, TimeUtils, IERC20 {
    using SafeMath for uint256;

    uint256 public constant BILLION = 1_000_000_000;

    uint256 public rate;

    uint256 public minted;

    mapping(address => mapping(address => uint256)) public allowances;

    mapping(uint256 => uint256) public historicMinted;

    function totalSupply() external view override returns (uint256) {
        return tokenSupply();
    }

    function balanceOf(address _address)
        external
        view
        override
        returns (uint256)
    {
        return balance(_address);
    }

    function transfer(address _to, uint256 _value)
        external
        override
        returns (bool)
    {
        if (_to == address(0)) {
            tokenBurn(_msgSender(), _value);
        } else {
            tokenTransfer(_msgSender(), _to, _value);
        }
        return true;
    }

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
            tokenBurn(_from, _value);
        } else {
            tokenTransfer(_from, _to, _value);
        }
        return true;
    }

    function approve(address _spender, uint256 _value)
        external
        override
        returns (bool)
    {
        allowances[_msgSender()][_spender] = _value;
        emit Approval(_msgSender(), _spender, _value);
        return true;
    }

    function allowance(address _owner, address _spender)
        external
        view
        override
        returns (uint256)
    {
        return allowances[_owner][_spender];
    }

    constructor(address _policy) public GenerationStore(_policy) {
        rate = 500_000_000;
    }

    function tokenTransfer(
        address _from,
        address _to,
        uint256 _value
    ) internal {
        update(_from);
        update(_to);
        mapping(address => uint256) storage bal = balances[currentGeneration];

        require(bal[_from] >= _value, "Source account has insufficient tokens");

        emit Transfer(_from, _to, _value);

        bal[_from] = bal[_from].sub(_value);
        bal[_to] = bal[_to].add(_value);
    }

    function tokenBurn(address _from, uint256 _value) internal {
        update(_from);
        mapping(address => uint256) storage bal = balances[currentGeneration];

        require(bal[_from] >= _value, "Insufficient funds to burn");

        emit Transfer(_from, address(0), _value);

        bal[_from] = bal[_from].sub(_value);
        setTokenSupply(tokenSupply().sub(_value));
    }

    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        rate = ECOx(_self).rate();
    }

    function valueOf(uint256 _value) public view returns (uint256) {
        uint256 ecoSupply = getToken().totalSupply().sub(minted);

        return ecoSupply.mul(_value).div(tokenSupply()).mul(rate).div(BILLION);
    }

    function valueAt(uint256 _value, uint256 _gen)
        public
        view
        returns (uint256)
    {
        uint256 ecoSupply =
            getStore().totalSupplyAt(_gen).sub(historicMinted[_gen]);
        return
            ecoSupply.mul(_value).div(totalSupplyAt(_gen)).mul(rate).div(
                BILLION
            );
    }

    function exchange(uint256 _value) external {
        uint256 eco = valueOf(_value);

        tokenTransfer(_msgSender(), address(this), _value);
        minted = minted.add(eco);

        Lockup lockup = getLockup();
        if (address(lockup) == address(0)) {
            getStore().mint(_msgSender(), eco);
        } else {
            getToken().approve(address(lockup), eco);
            getStore().mint(address(this), eco);
            lockup.depositFor(eco, _msgSender());
        }
    }

    function mint(address _to, uint256 _value) external {
        require(
            _msgSender() == policyFor(ID_FAUCET),
            "Caller not authorized to mint tokens"
        );

        update(_to);
        mapping(address => uint256) storage bal = balances[currentGeneration];

        bal[_to] = bal[_to].add(_value);
        setTokenSupply(tokenSupply().add(_value));

        emit Transfer(address(0), _to, _value);
    }

    function notifyGenerationIncrease() public override {
        uint256 _old = currentGeneration;

        super.notifyGenerationIncrease();

        historicMinted[_old] = minted;
    }

    function transformBalance(
        address,
        uint256,
        uint256 _balance
    ) internal pure override returns (uint256) {
        return _balance;
    }

    function destruct() external {
        require(
            _msgSender() == policyFor(ID_CLEANUP),
            "Only the cleanup policy contract can call destruct"
        );
        selfdestruct(_msgSender());
    }

    function name() public pure returns (string memory) {
        return "Eco-X";
    }

    function symbol() public pure returns (string memory) {
        return "ECOx";
    }

    function decimals() public pure returns (uint8) {
        return 18;
    }

    function getToken() private view returns (IERC20) {
        return IERC20(policyFor(ID_ERC20TOKEN));
    }

    function getStore() private view returns (EcoBalanceStore) {
        return EcoBalanceStore(policyFor(ID_BALANCESTORE));
    }

    function getLockup() private view returns (Lockup) {
        return
            Lockup(
                CurrencyTimer(policyFor(ID_CURRENCY_TIMER)).lockups(
                    currentGeneration
                )
            );
    }
}
