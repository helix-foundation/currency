// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../../currency/VoteCheckpoints.sol";
import "../../currency/ECOx.sol";
import "../../policy/PolicedUtils.sol";
import "../IGeneration.sol";

/** @title ECOxStaking
 *
 */
contract ECOxStaking is VoteCheckpoints, PolicedUtils {
    /** The Deposit event indicates that ECOx has been locked up, credited
     * to a particular address in a particular amount.
     *
     * @param source The address that a deposit certificate has been issued to.
     * @param amount The amount of ECOx tokens deposited.
     */
    event Deposit(address indexed source, uint256 amount);

    /** The Withdrawal event indicates that a withdrawal has been made to a particular
     * address in a particular amount.
     *
     * @param destination The address that has made a withdrawal.
     * @param amount The amount in basic unit of 10^{-18} ECOx (weicoX) tokens withdrawn.
     */
    event Withdrawal(address indexed destination, uint256 amount);

    // the ECOx contract address
    IERC20 public immutable ecoXToken;

    // marks each address's ability to withdraw, maps from address to last voted generation
    mapping(address => uint256) public votingTracker;

    uint256 public currentGeneration;

    constructor(Policy _policy, address _ecoXAddr)
        VoteCheckpoints("S-Eco-X", "sECOx")
        PolicedUtils(_policy)
    {
        ecoXToken = IERC20(_ecoXAddr);
    }

    function deposit(uint256 _amount) external {
        address _source = msg.sender;

        require(
            ecoXToken.transferFrom(_source, address(this), _amount),
            "Transfer failed"
        );

        _mint(_source, _amount);

        emit Deposit(_source, _amount);
    }

    function withdraw(uint256 _amount) external {
        address _destination = msg.sender;

        // do this first to ensure that any undelegations in this function are caught
        _burn(_destination, _amount);

        // generation indexing starts at 1000 so this will succeed for new addreses
        require(
            votingTracker[_destination] < currentGeneration - 1,
            "Must not vote or undelegate in the generation on or before withdrawing"
        );

        require(ecoXToken.transfer(_destination, _amount), "Transfer Failed");

        emit Withdrawal(_destination, _amount);
    }

    function votingECOx(address _voter, uint256 _blockNumber)
        external
        view
        returns (uint256)
    {
        return getPastVotingGons(_voter, _blockNumber);
    }

    function totalVotingECOx(uint256 _blockNumber)
        external
        view
        returns (uint256)
    {
        return getPastTotalSupply(_blockNumber);
    }

    function recordVote(address _who) external {
        require(
            msg.sender == policyFor(ID_POLICY_PROPOSALS) ||
                msg.sender == policyFor(ID_POLICY_VOTES),
            "Must be a voting contract to call"
        );

        votingTracker[_who] = currentGeneration;
    }

    function _undelegate(
        address delegator,
        address delegatee,
        uint256 amount
    ) internal override {
        // undelegating makes sure that voting is copied over
        votingTracker[delegator] = votingTracker[delegatee];

        super._undelegate(delegator, delegatee, amount);
    }

    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        currentGeneration = IGeneration(policyFor(ID_TIMED_POLICIES))
            .generation();
    }

    function notifyGenerationIncrease() public {
        // update currentGeneration
        currentGeneration = IGeneration(policyFor(ID_TIMED_POLICIES))
            .generation();
    }

    function transfer(address, uint256) public pure override returns (bool) {
        revert("sECOx is non-transferrable");
    }

    function transferFrom(
        address,
        address,
        uint256
    ) public pure override returns (bool) {
        revert("sECOx is non-transferrable");
    }
}
