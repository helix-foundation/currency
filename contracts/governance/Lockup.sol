// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./CurrencyTimer.sol";
import "../policy/PolicedUtils.sol";
import "../utils/TimeUtils.sol";
import "./IGeneration.sol";

/** @title Lockup
 * This provides deposit certificate functionality for the purpose of countering
 * inflationary effects.
 *
 * The contract instance is cloned by the CurrencyTimer contract when a vote outcome
 * mandates the issuance of deposit certificates. It has no special privileges.
 *
 * Deposits can be made and interest will be paid out to those who make
 * deposits. Deposit principal is accessable before the interested period
 * but for a penalty of not retrieving your gained interest as well as an
 * additional penalty of that same amount.
 */
contract Lockup is PolicedUtils, TimeUtils {
    /** The Sale event indicates that a deposit certificate has been sold
     * to a particular address in a particular amount.
     *
     * @param to The address that a deposit certificate has been issued to.
     * @param amount The amount of tokens deposited for the certificate.
     */
    event Sale(address to, uint256 amount);

    /** The Withdrawal event indicates that a withdrawal has been made,
     * and records the account that was credited, the amount it was credited
     * with.
     *
     * @param to The address that has made a withdrawal.
     * @param amount The amount in basic unit of 10^{-18} ECO (weico) withdrawn.
     */
    event Withdrawal(address to, uint256 amount);

    uint256 public generation;

    uint256 public duration;

    uint256 public constant BILLION = 1e9;

    uint256 public interest;

    uint256 public totalDeposit;

    mapping(address => uint256) public depositBalances;
    mapping(address => uint256) public depositLockupEnds;

    constructor(address _policy) PolicedUtils(_policy) {}

    function deposit(uint256 _amount) external {
        internalDeposit(_amount, msg.sender, msg.sender);
    }

    function withdraw() external {
        doWithdrawal(msg.sender, true);
    }

    function withdrawFor(address _who) external {
        doWithdrawal(_who, false);
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

    function doWithdrawal(address _owner, bool _allowEarly) internal {
        uint256 _amount = depositBalances[_owner];

        require(
            _amount > 0,
            "Withdrawals can only be made for accounts that made deposits"
        );

        bool early = getTime() < depositLockupEnds[_owner] || selling();

        require(_allowEarly || !early, "Only depositor may withdraw early");

        totalDeposit = totalDeposit - _amount;
        uint256 _delta = (_amount * interest) / BILLION;

        require(getToken().transfer(_owner, _amount), "Transfer Failed");
        getTimer().lockupWithdrawal(_owner, _delta, early);

        if (early) {
            emit Withdrawal(_owner, _amount - _delta);
        } else {
            emit Withdrawal(_owner, _amount + _delta);
        }
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

        require(
            getToken().transferFrom(_payer, address(this), _amount),
            "Transfer Failed"
        );

        totalDeposit = totalDeposit + _amount;
        depositBalances[_who] = depositBalances[_who] + _amount;
        depositLockupEnds[_who] = getTime() + duration;

        emit Sale(_who, _amount);
    }

    function getToken() private view returns (IERC20) {
        return IERC20(policyFor(ID_ECO));
    }

    function getTimer() private view returns (CurrencyTimer) {
        return CurrencyTimer(policyFor(ID_CURRENCY_TIMER));
    }
}
