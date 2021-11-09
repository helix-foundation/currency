// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../currency/GenerationStore.sol";
import "../currency/ECOx.sol";

/** @title ECOxLockup
 *
 */
contract ECOxLockup is GenerationStore {
    using SafeMath for uint256;

    /** The Deposit event indicates that ECOx has been locked up, credited
     * to a particular address in a particular amount.
     *
     * @param source The address that a deposit certificate has been issued to.
     * @param amount The amount of ECOx tokens deposited.
     */
    event Deposit(address source, uint256 amount);

    /** The Withdrawal event indicates that a withdrawal has been made
     *
     * @param destination The address that has made a withdrawal.
     * @param amount The amount in basic unit of 10^{-18} (atto) ECOx tokens withdrawn.
     */
    event Withdrawal(address destination, uint256 amount);

    // marks each address's ability to withdraw, maps from address to last voted generation
    mapping(address => uint256) public votingTracker;

    /** Marks the lowest balance during a generation. This is done by measuring the largest
     * amount below the previous generation (or delta) each account reaches each generation.
     * maps from generation to addrest to delta
     */
    mapping(uint256 => mapping(address => uint256)) public biggestDelta;

    constructor(address _policy) public GenerationStore(_policy) {}

    function deposit(uint256 _amount) external {
        address _source = _msgSender();
        update(_source);

        require(
            getToken().transferFrom(_source, address(this), _amount),
            "Transfer failed"
        );

        mapping(address => uint256) storage bal = balances[currentGeneration];

        bal[_source] = bal[_source].add(_amount);
        setTokenSupply(tokenSupply().add(_amount));

        emit Deposit(_source, _amount);
    }

    function withdraw(uint256 _amount) external {
        address _destination = _msgSender();
        update(_destination);

        mapping(address => uint256) storage bal = balances[currentGeneration];
        mapping(address => uint256) storage prevbal = balances[
            currentGeneration - 1
        ];
        mapping(address => uint256) storage currentDeltas = biggestDelta[
            currentGeneration
        ];

        require(bal[_destination] >= _amount, "Insufficient funds to withdraw");
        require(
            votingTracker[_destination] < currentGeneration - 1,
            "Must not vote in the generation on or before withdrawing"
        );

        bal[_destination] = bal[_destination].sub(_amount);
        setTokenSupply(tokenSupply().sub(_amount));

        if (bal[_destination] < prevbal[_destination]) {
            uint256 _delta = prevbal[_destination] - bal[_destination];
            if (_delta > currentDeltas[_destination]) {
                currentDeltas[address(0)] =
                    currentDeltas[address(0)] +
                    _delta -
                    currentDeltas[_destination];
                currentDeltas[_destination] = _delta;
            }
        }

        require(getToken().transfer(_destination, _amount), "Transfer failed");

        emit Withdrawal(_destination, _amount);
    }

    function votingECOx(address _voter, uint256 _gen)
        external
        view
        returns (uint256)
    {
        require(
            _gen <= currentGeneration,
            "Must look at current or previous generation"
        );

        uint256 _baseBalance = balanceAt(_voter, _gen - 2);
        uint256 _prevBalance = balanceAt(_voter, _gen - 1);
        uint256 _prevDelta = biggestDelta[_gen - 1][_voter];
        uint256 _currentDelta = biggestDelta[_gen][_voter];

        return
            _baseBalance - _prevDelta < _prevBalance - _currentDelta
                ? _baseBalance - _prevDelta
                : _prevBalance - _currentDelta;
    }

    function totalVotingECOx(uint256 _gen) external view returns (uint256) {
        require(
            _gen <= currentGeneration,
            "Must look at current or previous generation"
        );

        uint256 _baseTotal = totalSupplyAt(_gen - 2);
        uint256 _prevTotal = totalSupplyAt(_gen - 1);
        uint256 _prevDelta = biggestDelta[_gen - 1][address(0)];
        uint256 _currentDelta = biggestDelta[_gen][address(0)];

        return
            _baseTotal - _prevDelta < _prevTotal - _currentDelta
                ? _baseTotal - _prevDelta
                : _prevTotal - _currentDelta;
    }

    function recordVote(address _who) external {
        require(
            _msgSender() == policyFor(ID_POLICY_PROPOSALS) ||
                _msgSender() == policyFor(ID_POLICY_VOTES),
            "Must be a voting contract to call"
        );

        votingTracker[_who] = currentGeneration;
    }

    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        currentGeneration = IGeneration(policyFor(ID_TIMED_POLICIES))
            .generation();
    }

    function notifyGenerationIncrease() public override {
        super.notifyGenerationIncrease();
    }

    function getToken() private view returns (IERC20) {
        return IERC20(policyFor(ID_ECOX));
    }
}
