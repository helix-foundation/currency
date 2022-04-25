// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../currency/VoteCheckpoints.sol";
import "../currency/ECOx.sol";
import "../policy/PolicedUtils.sol";
import "../governance/IGeneration.sol";

/** @title ECOxLockup
 *
 */
contract ECOxLockup is VoteCheckpoints, PolicedUtils {
    /** The Deposit event indicates that ECOx has been locked up, credited
     * to a particular address in a particular amount.
     *
     * @param source The address that a deposit certificate has been issued to.
     * @param amount The amount of ECOx tokens deposited.
     */
    event Deposit(address source, uint256 amount);

    /** The Withdrawal event indicates that a withdrawal has been made to a particular
     * address in a particular amount.
     *
     * @param destination The address that has made a withdrawal.
     * @param amount The amount in basic unit of 10^{-18} ECOx (weicoX) tokens withdrawn.
     */
    event Withdrawal(address destination, uint256 amount);

    // marks each address's ability to withdraw, maps from address to last voted generation
    mapping(address => uint256) public votingTracker;

    uint256 public currentGeneration;

    constructor(address _policy)
        VoteCheckpoints("S-Eco-X", "sECOx")
        PolicedUtils(_policy)
    {}

    function deposit(uint256 _amount) external {
        address _source = msg.sender;

        require(
            getToken().transferFrom(_source, address(this), _amount),
            "Transfer failed"
        );

        _mint(_source, _amount);

        emit Deposit(_source, _amount);
    }

    function withdraw(uint256 _amount) external {
        address _destination = msg.sender;

        // generation indexing starts at 1000 so this will succeed for new addreses
        require(
            votingTracker[_destination] < currentGeneration - 1,
            "Must not vote in the generation on or before withdrawing"
        );

        _burn(_destination, _amount);

        require(getToken().transfer(_destination, _amount), "Transfer Failed");

        emit Withdrawal(_destination, _amount);
    }

    function votingECOx(address _voter, uint256 _blockNumber)
        external
        view
        returns (uint256)
    {
        return getPastVotes(_voter, _blockNumber);
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

    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        copyTokenMetadata(_self);
        currentGeneration = IGeneration(policyFor(ID_TIMED_POLICIES))
            .generation();
    }

    function notifyGenerationIncrease() public {
        uint256 _old = currentGeneration;
        uint256 _new = IGeneration(policyFor(ID_TIMED_POLICIES)).generation();
        require(_new != _old, "Generation has not increased");

        // update currentGeneration
        currentGeneration = _new;
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

    function getToken() private view returns (IERC20) {
        return IERC20(policyFor(ID_ECOX));
    }
}
