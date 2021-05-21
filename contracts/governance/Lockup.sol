// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../policy/PolicedUtils.sol";
import "../currency/EcoBalanceStore.sol";
import "../utils/TimeUtils.sol";

/** @title Lockup
 * This provides deposit certificate functionality for the purpose of countering
 * inflationary effects.
 *
 * The contract instance is cloned by the CurrencyGovernance contract when a vote outcome
 * mandates the issuance of deposit certificates. It has no special privileges.
 *
 * Deposits can be made and interest will be paid out to those who make
 * deposits. Deposit principal is inaccessible for the fill lockup period, but
 * interest can be withdrawn incrementally at the end of each interest period.
 *
 * Since interest totals are generally not evenly divisible by the number of
 * interest periods the error terms are collected and added to the principal
 * when it is withdrawn at the end of the lockup period.
 */
contract Lockup is PolicedUtils, TimeUtils {
    using SafeMath for uint256;

    /** The Sale event indicates that a deposit certificate has been sold
     * to a particular address in a particular amount.
     *
     * @param to The address that a deposit certificate has been issued to.
     * @param amount The amount of tokens deposited for the certificate.
     */
    event Sale(address to, uint256 amount);

    /** The Withdrawal event indicates that a withdrawal has been made,
     * and records the account that was credited, the amount it was credited
     * with, and a flag indicating if this is the final withdrawal against
     * the account's certificate.
     *
     * @param to The address that has made a withdrawal.
     * @param amount The amount in basic unit of 10^{-18} (atto) ECO tokens withdrawn.
     */
    event Withdrawal(address to, uint256 amount);

    uint256 public generation;

    uint256 public duration;

    uint256 public constant BILLION = 1_000_000_000;

    uint256 public interest;

    uint256 public totalDeposit;

    mapping(address => uint256) public depositBalances;
    mapping(address => uint256) public depositLockupEnds;

    constructor(address _policy) public PolicedUtils(_policy) {}

    function deposit(uint256 _amount) external onlyClone {
        internalDeposit(_amount, _msgSender(), _msgSender());
    }

    function depositFor(uint256 _amount, address _who) external onlyClone {
        require(
            _msgSender() == policyFor(ID_ECOX),
            "Only allowed for ECOx exchange"
        );
        internalDeposit(_amount, _msgSender(), _who);
    }

    function withdraw() external onlyClone {
        doWithdrawal(_msgSender(), true);
    }

    function withdrawFor(address _who) external onlyClone {
        doWithdrawal(_who, false);
    }

    function destruct() external onlyClone {
        require(!selling(), "Cannot destroy while still open for selling");

        require(totalDeposit == 0, "All deposits must be withdrawn");

        getToken().transfer(
            address(uint160(policy)),
            getToken().balanceOf(address(this))
        );
        selfdestruct(address(uint160(policy)));
    }

    function clone(uint256 _duration, uint256 _interest)
        external
        returns (address)
    {
        address _clone = createClone(address(this));
        Lockup(_clone).initialize(address(this), _duration, _interest);
        return _clone;
    }

    function initialize(
        address _self,
        uint256 _duration,
        uint256 _interest
    ) external onlyConstruction {
        super.initialize(_self);
        generation = IGeneration(policyFor(ID_TIMED_POLICIES)).generation();
        duration = _duration;
        interest = _interest;
    }

    function mintNeeded() external view returns (uint256) {
        return
            totalDeposit.add(totalDeposit.mul(interest).div(BILLION)).sub(
                getToken().balanceOf(address(this))
            );
    }

    function doWithdrawal(address _owner, bool _allowEarly) internal {
        uint256 _amount = depositBalances[_owner];

        require(
            _amount > 0,
            "Withdrawals can only be made for accounts that made deposits"
        );

        bool early = getTime() < depositLockupEnds[_owner] || selling();

        require(_allowEarly || !early, "Only depositor may withdraw early");

        totalDeposit = totalDeposit.sub(_amount);
        uint256 _delta = _amount.mul(interest).div(BILLION);

        if (early) {
            _amount = _amount.sub(_delta);
        } else {
            _amount = _amount.add(_delta);
        }

        getToken().transfer(_owner, _amount);
    }

    function selling() public view returns (bool) {
        return
            IGeneration(policyFor(ID_TIMED_POLICIES)).generation() ==
            generation;
    }

    function internalDeposit(
        uint256 _amount,
        address _payer,
        address _who
    ) private {
        require(selling(), "Deposits can only be made during sale window");

        getToken().transferFrom(_payer, address(this), _amount);

        totalDeposit = totalDeposit.add(_amount);
        depositBalances[_who] = depositBalances[_who].add(_amount);
        depositLockupEnds[_who] = getTime().add(duration);

        emit Sale(_who, _amount);
    }

    function getToken() private view returns (IERC20) {
        return IERC20(policyFor(ID_ERC20TOKEN));
    }
}
