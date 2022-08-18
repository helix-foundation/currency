// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../VDF/BigNumber.sol";

/** @title Test helper for BigNumber
 */
contract BigNum {
    using BigNumber for BigNumber.Instance;

    function fromBytes(bytes calldata _value)
        external
        pure
        returns (bytes memory)
    {
        BigNumber.Instance memory instance = BigNumber.from(_value);
        return instance.asBytes();
    }

    function fromUint(uint256 _value) external pure returns (bytes memory) {
        BigNumber.Instance memory instance = BigNumber.from(_value);
        return instance.asBytes();
    }

    function asBytes(bytes calldata _value, uint256 size)
        external
        pure
        returns (bytes memory)
    {
        BigNumber.Instance memory instance = BigNumber.from(_value);
        return instance.asBytes(size);
    }

    function add(bytes calldata _a, bytes calldata _b)
        external
        pure
        returns (bytes memory)
    {
        BigNumber.Instance memory _ai = BigNumber.from(_a);
        BigNumber.Instance memory _bi = BigNumber.from(_b);
        return _ai.privateAdd(_bi).asBytes();
    }

    function rightShift(bytes calldata _a, uint256 value)
        external
        pure
        returns (bytes memory)
    {
        BigNumber.Instance memory _ai = BigNumber.from(_a);
        return _ai.privateRightShift(value).asBytes();
    }

    function absdiff(bytes calldata _a, bytes calldata _b)
        external
        pure
        returns (bytes memory)
    {
        BigNumber.Instance memory _ai = BigNumber.from(_a);
        BigNumber.Instance memory _bi = BigNumber.from(_b);
        return _ai.absdiff(_bi).asBytes();
    }

    function modmul(
        bytes calldata _a,
        bytes calldata _b,
        bytes calldata _c
    ) external view returns (bytes memory) {
        BigNumber.Instance memory _ai = BigNumber.from(_a);
        BigNumber.Instance memory _bi = BigNumber.from(_b);
        BigNumber.Instance memory _ci = BigNumber.from(_c);
        return _ai.modmul(_bi, _ci).asBytes();
    }

    function modexp(
        bytes calldata _a,
        bytes calldata _b,
        bytes calldata _c
    ) external view returns (bytes memory) {
        BigNumber.Instance memory _ai = BigNumber.from(_a);
        BigNumber.Instance memory _bi = BigNumber.from(_b);
        BigNumber.Instance memory _ci = BigNumber.from(_c);
        return _ai.modexp(_bi, _ci).asBytes();
    }

    function cmp(bytes calldata _a, bytes calldata _b)
        external
        pure
        returns (int256)
    {
        BigNumber.Instance memory _ai = BigNumber.from(_a);
        BigNumber.Instance memory _bi = BigNumber.from(_b);
        return _ai.cmp(_bi);
    }
}
