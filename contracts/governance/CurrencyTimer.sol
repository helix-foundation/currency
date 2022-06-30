// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../policy/PolicedUtils.sol";
import "../policy/Policy.sol";
import "./PolicyProposals.sol";
import "./CurrencyGovernance.sol";
import "../currency/InflationRootHashProposal.sol";
import "../utils/TimeUtils.sol";
import "./IGenerationIncrease.sol";
import "./IGeneration.sol";
import "./Lockup.sol";
import "./Inflation.sol";
import "./ILockups.sol";
import "../currency/ECO.sol";

/** @title TimedPolicies
 * Oversees the time-based recurring processes that allow governance of the
 * Eco currency.
 */
contract CurrencyTimer is PolicedUtils, IGenerationIncrease, ILockups {
    /** The on-chain address for the currency voting contract. This contract is
     * cloned for each new currency vote.
     */
    CurrencyGovernance public bordaImpl;

    Inflation public inflationImpl;
    Lockup public lockupImpl;

    InflationRootHashProposal public inflationRootHashProposalImpl;

    // the ECO contract address
    ECO public immutable ecoToken;

    mapping(uint256 => InflationRootHashProposal)
        public rootHashAddressPerGeneration;

    /* Current generation of the balance store. */
    uint256 public currentGeneration;

    mapping(uint256 => Lockup) public override lockups;
    mapping(address => bool) public isLockup;

    event NewInflation(Inflation indexed addr);
    event NewLockup(Lockup indexed addr);
    event NewCurrencyGovernance(CurrencyGovernance indexed addr);

    /* Event to be emitted when InflationRootHashProposal contract spawned.
     */
    event NewInflationRootHashProposal(
        InflationRootHashProposal indexed inflationRootHashProposalContract,
        uint256 indexed generation
    );

    constructor(
        Policy _policy,
        CurrencyGovernance _borda,
        Inflation _inflation,
        Lockup _lockup,
        InflationRootHashProposal _inflationRootHashProposal,
        ECO _ecoAddr
    ) PolicedUtils(_policy) {
        bordaImpl = _borda;
        inflationImpl = _inflation;
        lockupImpl = _lockup;
        inflationRootHashProposalImpl = _inflationRootHashProposal;
        ecoToken = _ecoAddr;
    }

    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);

        // all of these values are better left mutable to allow for easier governance
        bordaImpl = CurrencyTimer(_self).bordaImpl();
        inflationImpl = CurrencyTimer(_self).inflationImpl();
        lockupImpl = CurrencyTimer(_self).lockupImpl();
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
            if (uint8(bg.stage()) < 3) {
                bg.updateStage();
            }
            if (uint8(bg.stage()) == 3) {
                bg.compute();
            }
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
            CurrencyGovernance _clone = CurrencyGovernance(bordaImpl.clone());
            policy.setPolicy(ID_CURRENCY_GOVERNANCE, address(_clone));
            emit NewCurrencyGovernance(_clone);
        }

        // new root hash
        // better tests could allow this to only need to be done in the next if statement
        rootHashAddressPerGeneration[_old] = InflationRootHashProposal(
            inflationRootHashProposalImpl.clone()
        );
        rootHashAddressPerGeneration[_old].configure(block.number);

        emit NewInflationRootHashProposal(
            rootHashAddressPerGeneration[_old],
            _old
        );

        if (_numberOfRecipients > 0 && _randomInflationReward > 0) {
            // new inflation contract
            Inflation _clone = Inflation(inflationImpl.clone());
            ecoToken.mint(
                address(_clone),
                _numberOfRecipients * _randomInflationReward
            );
            _clone.startInflation(_numberOfRecipients, _randomInflationReward);
            emit NewInflation(_clone);
        }

        if (_lockupDuration > 0 && _lockupInterest > 0) {
            Lockup lockup = Lockup(
                lockupImpl.clone(_lockupDuration, _lockupInterest)
            );
            emit NewLockup(lockup);
            lockups[_new] = lockup;
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
            ecoToken.burn(_withdrawer, _amount);
        } else {
            ecoToken.mint(_withdrawer, _amount);
        }
    }
}
