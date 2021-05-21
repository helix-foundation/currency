// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../../contracts/proxy/ForwardTarget.sol";

/** @title Test forward target */
contract SampleForward is ForwardTarget {
    using SafeMath for uint256;

    // value holder
    uint256 public value;

    constructor() public {
        value = 1;
    }

    /** @notice Default */
    receive() external payable {
        value += 1;
    }

    /** @notice Chained storage initializer */
    function initialize(address _self) public override onlyConstruction {
        super.initialize(_self);
        value = SampleForward(address(uint160(_self))).value();
    }

    /** @notice Increment value */
    function increment() public {
        for (uint256 i = 0; i < 15; ++i) {
            value++;
        }
    }

    /** @notice Increment value by sum of parameters */
    function sums(
        uint256 _a,
        uint256 _b,
        uint256 _c,
        uint256 _d,
        uint256 _e,
        uint256 _f
    ) public {
        uint256 _t = value;
        _t = _t.add(_a);
        _t = _t.add(_b);
        _t = _t.add(_c);
        _t = _t.add(_d);
        _t = _t.add(_e);
        _t = _t.add(_f);
        value = _t;
    }

    /** @notice Multi-return with side effects */
    function incsums()
        public
        returns (
            uint256 _a,
            uint256 _b,
            uint256 _c,
            uint256 _d,
            uint256 _e,
            uint256 _f
        )
    {
        value += 1;
        _a = value;
        _b = _a.add(1);
        _c = _b.add(1);
        _d = _c.add(1);
        _e = _d.add(1);
        _f = _e.add(1);
    }

    /** @notice Multi-return without side effects */
    function retsums()
        public
        view
        returns (
            uint256 _a,
            uint256 _b,
            uint256 _c,
            uint256 _d,
            uint256 _e,
            uint256 _f
        )
    {
        _a = value;
        _b = _a.add(1);
        _c = _b.add(1);
        _d = _c.add(1);
        _e = _d.add(1);
        _f = _e.add(1);
    }

    /** @notice Recursion test using internal call */
    function intcall(uint256 _loops) public {
        if (_loops == 0) {
            value++;
        } else {
            intcall(_loops.sub(1));
        }
    }

    /** @notice Recursion test using full external call */
    function extcall(uint256 _loops) public {
        if (_loops == 0) {
            value++;
        } else {
            this.extcall(_loops.sub(1));
        }
    }
}
