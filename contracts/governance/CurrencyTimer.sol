// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../policy/PolicedUtils.sol";
import "../policy/Policy.sol";
import "./PolicyProposals.sol";
import "./CurrencyGovernance.sol";
import "./SimplePolicySetter.sol";
import "../currency/InflationRootHashProposal.sol";
import "../utils/TimeUtils.sol";
import "./IGenerationIncrease.sol";
import "./IGeneration.sol";
import "./Lockup.sol";
import "./Inflation.sol";
import "./ILockups.sol";

/** @title TimedPolicies
 * Oversees the time-based recurring processes that allow governance of the
 * Eco currency.
 */
contract CurrencyTimer is PolicedUtils, IGenerationIncrease, ILockups {
    /** The on-chain address for the currency voting contract. This contract is
     * cloned for each new currency vote.
     */
    address public bordaImpl;

    address public inflationImpl;
    address public lockupImpl;

    address public simplePolicyImpl;

    address public inflationRootHashProposalImpl;

    mapping(uint256 => address) public rootHashAddressPerGeneration;

    /* Current generation of the balance store. */
    uint256 public currentGeneration;

    mapping(uint256 => address) public override lockups;
    mapping(address => bool) public isLockup;

    event InflationStarted(address indexed addr);
    event LockupOffered(address indexed addr);
    event NewCurrencyGovernance(address indexed addr);

    /* Event to be emitted when InflationRootHashProposalStarted contract spawned.
     */
    event InflationRootHashProposalStarted(
        address inflationRootHashProposalContract,
        uint256 indexed generation
    );

    constructor(
        address _policy,
        address _borda,
        address _inflation,
        address _lockup,
        address _simplepolicy,
        address _inflationRootHashProposal
    ) PolicedUtils(_policy) {
        bordaImpl = _borda;
        inflationImpl = _inflation;
        lockupImpl = _lockup;
        simplePolicyImpl = _simplepolicy;
        inflationRootHashProposalImpl = _inflationRootHashProposal;
    }

    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);

        bordaImpl = CurrencyTimer(_self).bordaImpl();
        inflationImpl = CurrencyTimer(_self).inflationImpl();
        lockupImpl = CurrencyTimer(_self).lockupImpl();
        simplePolicyImpl = CurrencyTimer(_self).simplePolicyImpl();
        inflationRootHashProposalImpl = CurrencyTimer(_self)
            .inflationRootHashProposalImpl();
    }

    function notifyGenerationIncrease() external override {
        uint256 _old = currentGeneration;
        uint256 _new = IGeneration(policyFor(ID_TIMED_POLICIES)).generation();
        require(_new != _old, "Generation has not increased");

        currentGeneration = _new;

        CurrencyGovernance bg = CurrencyGovernance(
            policyFor(ID_CURRENCY_GOVERNANCE)
        );

        uint256 _numberOfRecipients = 0;
        uint256 _randomInflationReward = 0;
        uint256 _lockupDuration = 0;
        uint256 _lockupInterest = 0;

        if (address(bg) != address(0)) {
            address winner = bg.winner();
            if (winner != address(0)) {
                (
                    ,
                    _numberOfRecipients,
                    _randomInflationReward,
                    _lockupDuration,
                    _lockupInterest,

                ) = bg.proposals(winner);
            }
        }

        {
            address _clone = CurrencyGovernance(bordaImpl).clone();
            SimplePolicySetter sps = SimplePolicySetter(
                SimplePolicySetter(simplePolicyImpl).clone(
                    ID_CURRENCY_GOVERNANCE,
                    _clone
                )
            );
            Policy(policy).internalCommand(address(sps));
            emit NewCurrencyGovernance(_clone);
        }

        // new root hash
        // better tests could allow this to only need to be done in the next if statement
        rootHashAddressPerGeneration[_old] = InflationRootHashProposal(
            inflationRootHashProposalImpl
        ).clone();
        InflationRootHashProposal(rootHashAddressPerGeneration[_old]).configure(
                block.number
            );

        emit InflationRootHashProposalStarted(
            rootHashAddressPerGeneration[_old],
            _old
        );

        if (_numberOfRecipients > 0 && _randomInflationReward > 0) {
            // new inflation contract
            address _clone = Inflation(inflationImpl).clone();
            getStore().mint(
                _clone,
                _numberOfRecipients * _randomInflationReward
            );
            Inflation(_clone).startInflation(
                _numberOfRecipients,
                _randomInflationReward
            );
            emit InflationStarted(_clone);
        }

        if (_lockupDuration > 0 && _lockupInterest > 0) {
            Lockup lockup = Lockup(
                Lockup(lockupImpl).clone(_lockupDuration, _lockupInterest)
            );
            emit LockupOffered(address(lockup));
            lockups[_new] = address(lockup);
            isLockup[address(lockup)] = true;
        }
    }

    function lockupWithdrawal(
        address _withdrawer,
        uint256 _amount,
        bool _penalty
    ) external {
        require(isLockup[msg.sender], "Not authorized to call this function");

        if (_penalty) {
            getStore().burn(_withdrawer, _amount);
        } else {
            getStore().mint(_withdrawer, _amount);
        }
    }

    /** Get the associated balance store address.
     */
    function getStore() private view returns (IECO) {
        return IECO(policyFor(ID_ECO));
    }
}
