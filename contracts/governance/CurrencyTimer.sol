// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "../policy/PolicedUtils.sol";
import "../policy/Policy.sol";
import "./PolicyProposals.sol";
import "./CurrencyGovernance.sol";
import "./SimplePolicySetter.sol";
import "../utils/TimeUtils.sol";
import "./ITimeNotifier.sol";
import "./IGeneration.sol";
import "./Lockup.sol";
import "./ILockups.sol";

/** @title TimedPolicies
 * Oversees the time-based recurring processes that allow governance of the
 * Eco currency.
 */
contract CurrencyTimer is PolicedUtils, ITimeNotifier, ILockups {
    using SafeMath for uint256;

    /** The on-chain address for the currency voting contract. This contract is
     * cloned for each new currency vote.
     */
    address public bordaImpl;

    address public inflationImpl;
    address public lockupImpl;

    address public simplePolicyImpl;

    /* Current generation of the balance store. */
    uint256 public currentGeneration;

    mapping(uint256 => address) public override lockups;

    event CurrencyGovernanceDecisionStarted(address contractAddress);
    event InflationStarted(address indexed addr);
    event LockupOffered(address indexed addr);

    constructor(
        address _policy,
        address _borda,
        address _inflation,
        address _lockup,
        address _simplepolicy
    ) public PolicedUtils(_policy) {
        bordaImpl = _borda;
        inflationImpl = _inflation;
        lockupImpl = _lockup;
        simplePolicyImpl = _simplepolicy;
    }

    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);

        bordaImpl = CurrencyTimer(_self).bordaImpl();
        inflationImpl = CurrencyTimer(_self).inflationImpl();
        lockupImpl = CurrencyTimer(_self).lockupImpl();
        simplePolicyImpl = CurrencyTimer(_self).simplePolicyImpl();
    }

    function notifyGenerationIncrease() external override {
        uint256 _old = currentGeneration;
        uint256 _new = IGeneration(policyFor(ID_TIMED_POLICIES)).generation();
        require(_new != _old, "Generation has not increased");

        currentGeneration = _new;

        CurrencyGovernance bg =
            CurrencyGovernance(policyFor(ID_CURRENCY_GOVERNANCE));

        uint256 randomInflationWinners = 0;
        uint256 randomInflationPrize = 0;
        uint256 lockupDuration = 0;
        uint256 lockupInterest = 0;

        if (address(bg) != address(0)) {
            address winner = bg.winner();
            if (winner != address(0)) {
                bool valid;
                (
                    valid,
                    randomInflationWinners,
                    randomInflationPrize,
                    lockupDuration,
                    lockupInterest
                ) = bg.proposals(winner);
            }
        }

        {
            address _clone = CurrencyGovernance(bordaImpl).clone();
            SimplePolicySetter sps =
                SimplePolicySetter(
                    SimplePolicySetter(simplePolicyImpl).clone(
                        ID_CURRENCY_GOVERNANCE,
                        _clone
                    )
                );
            Policy(policy).internalCommand(address(sps));
            sps.destruct();
        }

        if (randomInflationWinners > 0 && randomInflationPrize > 0) {
            address _clone = Inflation(inflationImpl).clone();
            getStore().mint(
                _clone,
                randomInflationWinners.mul(randomInflationPrize)
            );
            Inflation(_clone).startInflation(
                randomInflationWinners,
                randomInflationPrize
            );
            emit InflationStarted(_clone);
        }

        Lockup lockup = Lockup(lockups[_old]);
        if (address(lockup) != address(0)) {
            getStore().mint(address(lockup), lockup.mintNeeded());
        }

        if (lockupDuration > 0 && lockupInterest > 0) {
            lockup = Lockup(
                Lockup(lockupImpl).clone(lockupDuration, lockupInterest)
            );
            emit LockupOffered(address(lockup));
            lockups[_new] = address(lockup);
        }
    }

    /** Get the associated ERC20 token address.
     */
    function getToken() private view returns (IERC20) {
        return IERC20(policyFor(ID_ERC20TOKEN));
    }

    /** Get the associated balance store address.
     */
    function getStore() private view returns (EcoBalanceStore) {
        return EcoBalanceStore(policyFor(ID_BALANCESTORE));
    }
}
