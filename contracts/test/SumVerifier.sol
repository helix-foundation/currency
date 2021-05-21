// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "./SampleForward.sol";

/** @title Verifier for sums */
contract SumVerifier {
    using SafeMath for uint256;

    /** @notice verify a SampleForward for correctness */
    function sumverify(SampleForward _funk) public {
        uint256 a;
        uint256 b;
        uint256 c;
        uint256 d;
        uint256 e;
        uint256 f;

        (a, b, c, d, e, f) = _funk.incsums();

        require(a != 0, "a != 0");
        require(b == a.add(1), "b == a + 1");
        require(c == a.add(2), "c == a + 2");
        require(d == a.add(3), "d == a + 3");
        require(e == a.add(4), "e == a + 4");
        require(f == a.add(5), "f == a + 5");
    }
}
