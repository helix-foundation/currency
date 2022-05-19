// SPDX-License-Identifier: MIT

pragma solidity ^0.8.9;

import "./ERC20.sol";

/**
 * @dev Extension of ERC20 to support Compound-like voting and delegation. This version is more generic than Compound's,
 * and supports token supply up to 2^224^ - 1, while COMP is limited to 2^96^ - 1.
 *
 * This extension keeps a history (checkpoints) of each account's vote power. Vote power can be delegated either
 * by calling the {delegate} function directly, or by providing a signature to be used with {delegateBySig}. Voting
 * power can be queried through the public accessors {getVotes} and {getPastVotes}.
 *
 * By default, token balance does not account for voting power. This makes transfers cheaper. The downside is that it
 * requires users to delegate to themselves in order to activate checkpoints and have their voting power tracked.
 * Enabling self-delegation can easily be done by overriding the {delegates} function. Keep in mind however that this
 * will significantly increase the base gas cost of transfers.
 *
 * _Available since v4.2._
 */
abstract contract VoteCheckpoints is ERC20 {
    struct Checkpoint {
        uint32 fromBlock;
        uint224 value;
    }

    bytes32 private constant _DELEGATION_TYPEHASH =
        keccak256("Delegation(address delegatee,uint256 nonce,uint256 expiry)");

    mapping(address => address) private _delegates;
    mapping(address => Checkpoint[]) public checkpoints;
    Checkpoint[] private _totalSupplyCheckpoints;

    /**
     * @dev Emitted when an account changes their delegate.
     */
    event ChangeDelegate(address indexed delegator, address indexed toDelegate);

    /**
     * @dev Emitted when a token transfer or delegate change results in changes to an account's voting power.
     */
    event ChangeDelegateVotes(address indexed delegate, uint256 newBalance);

    constructor(string memory _name, string memory _symbol)
        ERC20(_name, _symbol)
    {}

    /** Returns the total (inflation corrected) token supply at a specified block number
     */
    function totalSupplyAt(uint256 _blockNumber)
        public
        view
        virtual
        returns (uint256)
    {
        return getPastTotalSupply(_blockNumber);
    }

    /** Return historical balance at given generation.
     *
     * If the latest block number for the account is before the requested
     * block then the most recent known balance is returned. Otherwise the
     * exact block number requested is returned.
     *
     * @param _owner The account to check the balance of.
     * @param _blockNumber The block number to check the balance at the start
     *                        of. Must be less than or equal to the present
     *                        block number.
     */
    function balanceAt(address _owner, uint256 _blockNumber)
        public
        view
        virtual
        returns (uint256)
    {
        return getPastVotes(_owner, _blockNumber);
    }

    /**
     * @dev Get number of checkpoints for `account`.
     */
    function numCheckpoints(address account)
        public
        view
        virtual
        returns (uint32)
    {
        require(
            checkpoints[account].length <= type(uint32).max,
            "number of checkpoints cannot be casted safely"
        );
        return uint32(checkpoints[account].length);
    }

    /**
     * @dev Get the address `account` is currently delegating to. Defaults to the account address itself if none specified
     */
    function getDelegate(address account)
        public
        view
        virtual
        returns (address)
    {
        address _voter = _delegates[account];
        return _voter == address(0) ? account : _voter;
    }

    /**
     * @dev Gets the current votes balance for `account`
     */
    function getVotes(address account) public view returns (uint256) {
        uint256 pos = checkpoints[account].length;
        return pos == 0 ? 0 : checkpoints[account][pos - 1].value;
    }

    /**
     * @dev Retrieve the number of votes for `account` at the end of `blockNumber`.
     *
     * Requirements:
     *
     * - `blockNumber` must have been already mined
     */
    function getPastVotes(address account, uint256 blockNumber)
        public
        view
        returns (uint256)
    {
        require(
            blockNumber < block.number,
            "VoteCheckpoints: block not yet mined"
        );
        return _checkpointsLookup(checkpoints[account], blockNumber);
    }

    /**
     * @dev Retrieve the `totalSupply` at the end of `blockNumber`. Note, this value is the sum of all balances.
     * It is NOT the sum of all the delegated votes!
     *
     * Requirements:
     *
     * - `blockNumber` must have been already mined
     */
    function getPastTotalSupply(uint256 blockNumber)
        public
        view
        returns (uint256)
    {
        require(
            blockNumber < block.number,
            "VoteCheckpoints: block not yet mined"
        );
        return _checkpointsLookup(_totalSupplyCheckpoints, blockNumber);
    }

    // CONSIDER: evaluate if we actually want binary search as opposed to just backwards iteration from present
    /**
     * @dev Lookup a value in a list of (sorted) checkpoints.
     */
    function _checkpointsLookup(Checkpoint[] storage ckpts, uint256 blockNumber)
        internal
        view
        returns (uint256)
    {
        // We run a binary search to look for the earliest checkpoint taken after `blockNumber`.
        //
        // During the loop, the index of the wanted checkpoint remains in the range [low-1, high).
        // With each iteration, either `low` or `high` is moved towards the middle of the range to maintain the invariant.
        // - If the middle checkpoint is after `blockNumber`, we look in [low, mid)
        // - If the middle checkpoint is before or equal to `blockNumber`, we look in [mid+1, high)
        // Once we reach a single value (when low == high), we've found the right checkpoint at the index high-1, if not
        // out of bounds (in which case we're looking too far in the past and the result is 0).
        // Note that if the latest checkpoint available is exactly for `blockNumber`, we end up with an index that is
        // past the end of the array, so we technically don't find a checkpoint after `blockNumber`, but it works out
        // the same.

        // Early exit if this is a request for the most recent value or we have no checkpoints
        uint256 ckptsLength = ckpts.length;
        if (ckptsLength == 0) return 0;
        Checkpoint memory lastCkpt = ckpts[ckptsLength - 1];
        if (blockNumber >= lastCkpt.fromBlock) return lastCkpt.value;

        uint256 high = ckptsLength;
        uint256 low = 0;
        while (low < high) {
            uint256 mid = low + ((high - low) >> 1);
            if (ckpts[mid].fromBlock > blockNumber) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }

        return high == 0 ? 0 : ckpts[high - 1].value;
    }

    /**
     * @dev Delegate votes from the sender to `delegatee`.
     */
    function delegate(address delegatee) public virtual {
        return _delegate(msg.sender, delegatee);
    }

    /**
     * @dev Maximum token supply. Defaults to `type(uint224).max` (2^224^ - 1).
     */
    function _maxSupply() internal view virtual returns (uint224) {
        return type(uint224).max;
    }

    /**
     * @dev Snapshots the totalSupply after it has been increased.
     */
    function _mint(address account, uint256 amount)
        internal
        virtual
        override
        returns (uint256)
    {
        amount = super._mint(account, amount);
        require(
            totalSupply() <= _maxSupply(),
            "VoteCheckpoints: total supply risks overflowing votes"
        );

        _writeCheckpoint(_totalSupplyCheckpoints, _add, amount);
        return amount;
    }

    /**
     * @dev Snapshots the totalSupply after it has been decreased.
     */
    function _burn(address account, uint256 amount)
        internal
        virtual
        override
        returns (uint256)
    {
        amount = super._burn(account, amount);

        _writeCheckpoint(_totalSupplyCheckpoints, _subtract, amount);
        return amount;
    }

    /**
     * @dev Move voting power when tokens are transferred.
     *
     * Emits a {ChangeDelegateVotes} event.
     */
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        _moveVotingPower(getDelegate(from), getDelegate(to), amount);
    }

    /**
     * @dev Change delegation for `delegator` to `delegatee`.
     *
     * Emits events {ChangeDelegate} and {ChangeDelegateVotes}.
     */
    function _delegate(address delegator, address delegatee) internal virtual {
        address currentDelegate = getDelegate(delegator);
        uint256 delegatorBalance = _balances[delegator];
        _delegates[delegator] = delegatee;

        emit ChangeDelegate(delegator, delegatee);

        _moveVotingPower(currentDelegate, delegatee, delegatorBalance);
    }

    function _moveVotingPower(
        address src,
        address dst,
        uint256 amount
    ) private {
        if (src != dst && amount > 0) {
            if (src != address(0)) {
                uint256 newWeight = _writeCheckpoint(
                    checkpoints[src],
                    _subtract,
                    amount
                );
                emit ChangeDelegateVotes(src, newWeight);
            }

            if (dst != address(0)) {
                uint256 newWeight = _writeCheckpoint(
                    checkpoints[dst],
                    _add,
                    amount
                );
                emit ChangeDelegateVotes(dst, newWeight);
            }
        }
    }

    function _writeCheckpoint(
        Checkpoint[] storage ckpts,
        function(uint256, uint256) view returns (uint256) op,
        uint256 delta
    ) internal returns (uint256) {
        require(
            delta <= type(uint224).max,
            "newWeight cannot be casted safely"
        );
        require(
            block.number <= type(uint32).max,
            "block number cannot be casted safely"
        );

        uint256 pos = ckpts.length;

        /* if there are no checkpoints, just write the value
         * This part assumes that an account would never exist with a balance but without checkpoints.
         * This function cannot be called directly, so there's no malicious way to exploit the fact that
         * the op is not checked and assumed to be add or replace.
         */
        if (pos == 0) {
            ckpts.push(
                Checkpoint({
                    fromBlock: uint32(block.number),
                    value: uint224(delta)
                })
            );
            return delta;
        }

        // else, we iterate on the existing checkpoints as per usual
        Checkpoint storage newestCkpt = ckpts[pos - 1];

        uint256 oldWeight = newestCkpt.value;
        uint256 newWeight = op(oldWeight, delta);

        require(
            newWeight <= type(uint224).max,
            "newWeight cannot be casted safely"
        );

        if (newestCkpt.fromBlock == block.number) {
            newestCkpt.value = uint224(newWeight);
        } else {
            ckpts.push(
                Checkpoint({
                    fromBlock: uint32(block.number),
                    value: uint224(newWeight)
                })
            );
        }
        return newWeight;
    }

    function _add(uint256 a, uint256 b) internal pure returns (uint256) {
        return a + b;
    }

    function _subtract(uint256 a, uint256 b) internal pure returns (uint256) {
        return a - b;
    }

    function _replace(uint256, uint256 b) internal pure returns (uint256) {
        return b;
    }
}
