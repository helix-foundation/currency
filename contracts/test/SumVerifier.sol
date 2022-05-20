// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./SampleForward.sol";

/** @title Verifier for sums */
contract SumVerifier {
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
        require(b == a + 1, "b == a + 1");
        require(c == a + 2, "c == a + 2");
        require(d == a + 3, "d == a + 3");
        require(e == a + 4, "e == a + 4");
        require(f == a + 5, "f == a + 5");
    }
}
