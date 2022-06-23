// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

library StringPacker {
    function pack(string memory unpacked)
        internal
        pure
        returns (bytes32 packed)
    {
        require(bytes(unpacked).length < 32);
        assembly {
            packed := mload(add(unpacked, 31))
        }
    }

    function unpack(bytes32 packed)
        internal
        pure
        returns (string memory unpacked)
    {
        uint256 l = uint256(packed >> 248);
        require(l < 32);
        unpacked = string(new bytes(l));
        assembly {
            mstore(add(unpacked, 31), packed) // Potentially writes into unallocated memory, which is fine
        }
    }
}
