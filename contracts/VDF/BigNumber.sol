/*
MIT License

Copyright (c) 2017 zcoinofficial

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// Originated from https://github.com/zcoinofficial/solidity-BigNumber

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// solhint-disable no-inline-assembly, no-empty-blocks, function-max-lines

/** @title Big integer math library
 */
library BigNumber {
    /*
     * BigNumber is defined as a struct named 'Instance' to avoid naming conflicts.
     * DO NOT ALLOW INSTANTIATING THIS DIRECTLY - use the 'from' functions defined below.
     * Hoping in future Solidity will allow visibility modifiers on structs.
     */

    struct Instance {
        bytes value;
    }

    /** @notice Create a new Bignumber instance from byte array
     * @dev    If the caller subsequently clears or modifies the input _value, it will corrupt the BigNumber value.
     * @param _value Number stored in big endian bytes
     * @return instance of BigNumber
     */
    function from(bytes memory _value) internal pure returns (Instance memory) {
        Instance memory instance;
        uint256 length = _value.length;
        if (length == 0x0) {
            // Zero
            instance.value = _value;
            return instance;
        }
        if (length % 0x20 == 0x0) {
            // Is this already multiple of 256 bit, and highest word is used?
            uint256 word;
            assembly {
                word := mload(add(_value, 0x20))
            }
            require(
                word != 0x0,
                "High-word must be set for 256bit-aligned numbers"
            );
            instance.value = _value;
            return instance;
        }

        require(
            _value[0] != 0x0,
            "High-byte must be set for non-256bit-aligned numbers"
        );

        uint256 paddedLength = 0x20 * ((length + 0x1F) / 0x20);
        uint256 offset = paddedLength - length;

        instance.value = new bytes(paddedLength);
        for (uint256 i = 0x0; i < offset; ++i) instance.value[i] = 0x0;
        for (uint256 i = 0x0; i < length; ++i)
            instance.value[offset + i] = _value[i];
        return instance;
    }

    /** @notice Create a new BigNumber instance from uint256
     * @param _value Number stored in uint256
     * @return instance of BigNumber
     */
    function from(uint256 _value) internal pure returns (Instance memory) {
        Instance memory instance;
        if (_value == 0x0) {
            instance.value = new bytes(0x0);
        } else {
            bytes memory b = new bytes(0x20);
            assembly {
                mstore(add(b, 0x20), _value)
            }
            instance.value = b;
        }
        return instance;
    }

    /** @notice Convert instance to padded byte array
     * @dev  If the caller modifies the returned buffer instance, it will corrupt the BigNumber value.
     * @param _instance BigNumber instance to convert
     * @param _size Desired size of byte array
     * @return byte array
     */
    function asBytes(Instance memory _instance, uint256 _size)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory value;
        require(
            _size >= _instance.value.length,
            "Number too large to represent"
        );
        require(_size % 0x20 == 0x0, "Size must be multiple of 0x20");

        if (_size == _instance.value.length) {
            value = _instance.value;
        } else {
            value = new bytes(_size);
            uint256 i = 0;
            for (; i < _size - _instance.value.length; ++i) value[i] = 0x0;
            for (; i < _size; ++i)
                value[i] = _instance.value[
                    i - (_size - _instance.value.length)
                ];
        }
        return value;
    }

    /** @notice Convert instance to minimal byte array
     * @param _base BigNumber instance to convert
     * @return byte array
     */
    function asBytes(Instance memory _base)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory instance;
        uint256 offset = 0;
        while (offset < _base.value.length && _base.value[offset] == 0x0) {
            ++offset;
        }

        uint256 size = _base.value.length - offset;

        instance = new bytes(size);
        for (uint256 i = 0x0; i < size; ++i)
            instance[i] = _base.value[offset + i];
        return instance;
    }

    /** @notice Obtain length (in bytes) of BigNumber instance
     * This will be rounded up to nearest multiple of 0x20 bytes
     *
     * @param _base BigNumber instance
     * @return Size (in bytes) of BigNumber instance
     */
    function byteLength(Instance memory _base) internal pure returns (uint256) {
        return _base.value.length;
    }

    /** @notice Obtain minimal length (in bytes) of BigNumber instance
     *
     * @param _base BigNumber instance
     * @return Size (in bytes) of minimal BigNumber instance
     */
    function minimalByteLength(Instance memory _base)
        internal
        pure
        returns (uint256)
    {
        return asBytes(_base).length;
    }

    /** @notice Perform modular exponentiation of BigNumber instance
     * @param _base Base number
     * @param _exponent Exponent
     * @param _modulus Modulus
     * @return (_base ^ _exponent) % _modulus
     */
    function modexp(
        Instance memory _base,
        Instance memory _exponent,
        Instance memory _modulus
    ) internal view returns (Instance memory) {
        Instance memory result;
        bytes memory _result = innerModExp(
            _base.value,
            _exponent.value,
            _modulus.value
        );
        result.value = _result;
        return result;
    }

    /** @notice Perform modular multiplication of BigNumber instances
     * @param _a number
     * @param _b number
     * @param _modulus Modulus
     * @return (_a * _b) % _modulus
     */
    function modmul(
        Instance memory _a,
        Instance memory _b,
        Instance memory _modulus
    ) internal view returns (Instance memory) {
        return modulo(multiply(_a, _b), _modulus);
    }

    /** @notice Compare two BigNumber instances for equality
     * @param _a number
     * @param _b number
     * @return -1 if (_a<_b), 1 if (_a>_b) and 0 if (_a==_b)
     */
    function cmp(Instance memory _a, Instance memory _b)
        internal
        pure
        returns (int256)
    {
        assert(_a.value.length % 0x20 == 0);
        assert(_b.value.length % 0x20 == 0);

        if (_a.value.length > _b.value.length) return 0x1;
        if (_b.value.length > _a.value.length) return -0x1;

        uint256 aPtr;
        uint256 bPtr;
        uint256 aWord;
        uint256 bWord;

        uint256 length = _a.value.length;

        assembly {
            aPtr := add(mload(_a), 0x20)
            bPtr := add(mload(_b), 0x20)
        }

        for (uint256 i = 0x0; i < length; i += 0x20) {
            assembly {
                aWord := mload(add(aPtr, i))
                bWord := mload(add(bPtr, i))
            }

            if (aWord > bWord) {
                return 0x1;
            }
            if (bWord > aWord) {
                return -0x1;
            }
        }

        return 0x0; //same value.
    }

    /** @notice Add two BigNumber instances
     * Not used outside the library itself
     */
    function privateAdd(Instance memory _a, Instance memory _b)
        internal
        pure
        returns (Instance memory)
    {
        Instance memory instance;
        if (_a.value.length == 0x0 && _b.value.length == 0x0) return from("");
        if (_a.value.length == 0x0) return _b;
        if (_b.value.length == 0x0) return _a;
        bytes memory value;
        int256 compare = cmp(_a, _b);

        if (compare >= 0x0) {
            //a>=b
            value = innerAdd(_a.value, _b.value);
        } else {
            value = innerAdd(_b.value, _a.value);
        }

        instance.value = value;
        return instance;
    }

    /** @dev max + min
     */
    function innerAdd(bytes memory _max, bytes memory _min)
        private
        pure
        returns (bytes memory)
    {
        assert(_max.length % 0x20 == 0);
        assert(_min.length % 0x20 == 0);

        bytes memory result;
        assembly {
            let result_start := mload(0x40) // Get the highest available block of memory

            let uint_max := not(0x0) // uint256 max (all bits set; inverse of 0)

            let carry := 0x0

            let max_len := mload(_max)
            let min_len := mload(_min) // load lengths of inputs

            let max_ptr := add(_max, max_len)
            let min_ptr := add(_min, min_len) // point to last word of each byte array.

            let result_ptr := add(add(result_start, 0x20), max_len) // set result_ptr end.

            for {
                let i := max_len
            } iszero(eq(i, 0x0)) {
                i := sub(i, 0x20)
            } {
                // for(int i=max_length; i!=0; i-=0x20)
                let max_val := mload(max_ptr) // get next word for 'max'
                switch gt(i, sub(max_len, min_len)) // if(i>(max_length-min_length)). while 'min' words are still available.
                case 1 {
                    let min_val := mload(min_ptr) //      get next word for 'min'

                    mstore(result_ptr, add(add(max_val, min_val), carry)) //      result_word = max_word+min_word+carry

                    switch gt(max_val, sub(uint_max, add(min_val, carry))) //      this switch block finds whether or not to set the carry bit for the next iteration.
                    case 0x1 {
                        carry := 0x1
                    }
                    default {
                        switch and(eq(carry, 0x1), eq(min_val, uint_max))
                        case 0x1 {
                            carry := 0x1
                        }
                        default {
                            carry := 0x0
                        }
                    }

                    min_ptr := sub(min_ptr, 0x20) //       point to next 'min' word
                }
                default {
                    // else: remainder after 'min' words are complete.
                    mstore(result_ptr, add(max_val, carry)) //       result_word = max_word+carry

                    switch and(eq(uint_max, max_val), eq(carry, 1)) //       this switch block finds whether or not to set the carry bit for the next iteration.
                    case 0x1 {
                        carry := 0x1
                    }
                    default {
                        carry := 0x0
                    }
                }
                result_ptr := sub(result_ptr, 0x20) // point to next 'result' word
                max_ptr := sub(max_ptr, 0x20) // point to next 'max' word
            }

            switch iszero(carry)
            case 0x1 {
                result_start := add(result_start, 0x20)
            } // if carry is 0x0, increment result_start, ie. length word for result is now one word position ahead.
            default {
                mstore(result_ptr, 0x1)
            } // else if carry is 0x1, store 0x1; overflow has occured, so length word remains in the same position.

            result := result_start // point 'result' bytes value to the correct address in memory
            mstore(result, add(max_len, mul(0x20, carry))) // store length of result. we are finished with the byte array.

            mstore(0x40, add(result, add(mload(result), 0x20))) // Update freemem pointer to point to new end of memory.
        }

        return (result);
    }

    /** @notice Return absolute difference between two instances
     * Not used outside the library itself
     */
    function absdiff(Instance memory _a, Instance memory _b)
        internal
        pure
        returns (Instance memory)
    {
        Instance memory instance;
        bytes memory value;
        int256 compare;
        compare = cmp(_a, _b);

        if (compare == 1) {
            value = innerDiff(_a.value, _b.value);
        } else if (compare == -0x1) {
            value = innerDiff(_b.value, _a.value);
        } else {
            return from("");
        }

        instance.value = value;
        return instance;
    }

    /** @dev max - min
     */
    function innerDiff(bytes memory _max, bytes memory _min)
        private
        pure
        returns (bytes memory)
    {
        assert(_max.length % 0x20 == 0);
        assert(_min.length % 0x20 == 0);

        bytes memory result;
        uint256 carry = 0x0;
        assembly {
            let result_start := mload(0x40) // Get the highest available block of memory

            let uint_max := not(0x0) // uint256 max. (all bits set; inverse of 0)
            let max_len := mload(_max)
            let min_len := mload(_min) // load lengths of inputs

            let len_diff := sub(max_len, min_len) //get differences in lengths.

            let max_ptr := add(_max, max_len)
            let min_ptr := add(_min, min_len) //go to end of arrays
            let result_ptr := add(result_start, max_len) //point to least significant result word.
            let memory_end := add(result_ptr, 0x20) // save memory_end to update free memory pointer at the end.

            for {
                let i := max_len
            } iszero(eq(i, 0x0)) {
                i := sub(i, 0x20)
            } {
                // for(int i=max_length; i!=0x0; i-=0x20)
                let max_val := mload(max_ptr) // get next word for 'max'
                switch gt(i, len_diff) // if(i>(max_length-min_length)). while 'min' words are still available.
                case 0x1 {
                    let min_val := mload(min_ptr) //      get next word for 'min'

                    mstore(result_ptr, sub(sub(max_val, min_val), carry)) //      result_word = (max_word-min_word)-carry

                    switch or(
                        lt(max_val, add(min_val, carry)),
                        and(eq(min_val, uint_max), eq(carry, 0x1))
                    ) //      this switch block finds whether or not to set the carry bit for the next iteration.
                    case 0x1 {
                        carry := 0x1
                    }
                    default {
                        carry := 0x0
                    }

                    min_ptr := sub(min_ptr, 0x20) //      point to next 'result' word
                }
                default {
                    // else: remainder after 'min' words are complete.

                    mstore(result_ptr, sub(max_val, carry)) //      result_word = max_word-carry

                    switch and(iszero(max_val), eq(carry, 0x1)) //      this switch block finds whether or not to set the carry bit for the next iteration.
                    case 0x1 {
                        carry := 0x1
                    }
                    default {
                        carry := 0x0
                    }
                }
                result_ptr := sub(result_ptr, 0x20) // point to next 'result' word
                max_ptr := sub(max_ptr, 0x20) // point to next 'max' word
            }

            //the following code removes any leading words containing all zeroes in the result.
            result_ptr := add(result_ptr, 0x20)
            for {

            } iszero(mload(result_ptr)) {
                result_ptr := add(result_ptr, 0x20)
            } {
                //for(result_ptr+=0x20;; result==0x0; result_ptr+=0x20)
                result_start := add(result_start, 0x20) // push up the start pointer for the result..
                max_len := sub(max_len, 0x20) // and subtract a word (0x20 bytes) from the result length.
            }

            result := result_start // point 'result' bytes value to the correct address in memory

            mstore(result, max_len) // store length of result. we are finished with the byte array.

            mstore(0x40, memory_end) // Update freemem pointer.
        }

        return (result);
    }

    /** @notice Multiply two instances
     * @param _a number
     * @param _b number
     * @return _a * _b
     */
    function multiply(Instance memory _a, Instance memory _b)
        internal
        view
        returns (Instance memory)
    {
        Instance memory res;
        res = opAndSquare(_a, _b, true); // add_and_square = (a+b)^2

        //no need to do subtraction part of the equation if a == b; if so, it has no effect on final result.
        if (cmp(_a, _b) != 0x0) {
            Instance memory diffSquared = opAndSquare(_a, _b, false); // diffSquared = (a-b)^2

            res = absdiff(res, diffSquared); // res = add_and_square - diffSquared
        }
        res = privateRightShift(res, 0x2); // res = res / 0x4
        return res;
    }

    /** @dev take two instances, add or diff them, then square the result
     */
    function opAndSquare(
        Instance memory _a,
        Instance memory _b,
        bool _add
    ) private view returns (Instance memory) {
        // mul uses the multiplication by squaring method, ie. a*b == ((a+b)^2 - (a-b)^2)/4.
        // using modular exponentation precompile for squaring. this requires taking a special modulus value of the form:
        // modulus == '1|(0*n)', where n = 2 * bit length of (a 'op' b).

        assert(_a.value.length % 0x20 == 0);
        assert(_b.value.length % 0x20 == 0);

        Instance memory res;
        Instance memory two = from(0x2);

        bytes memory _modulus;

        res = _add ? privateAdd(_a, _b) : absdiff(_a, _b);
        uint256 modIndex = (res.value.length * 0x2) + 0x20;

        //we pass the minimum modulus value which would return JUST the squaring part of the calculation; therefore the value may be many words long.
        //This is done by:
        //  - storing total modulus byte length
        //  - storing first word of modulus with correct bit set
        //  - updating the free memory pointer to come after total length.
        _modulus = new bytes(64);
        assembly {
            mstore(_modulus, modIndex) //store length of modulus
            mstore(add(_modulus, 0x20), 0x1) //set first modulus word
            mstore(0x40, add(_modulus, add(mload(_modulus), 0x20))) //update freemem pointer to be modulus index + length
        }

        //create modulus instance for modexp function
        Instance memory modulus;
        modulus.value = _modulus;

        res = modexp(res, two, modulus); // ((a 'op' b) ^ 0x2 % modulus) == (a 'op' b) ^ 0x2.
        return res;
    }

    /** @dev a % mod
     */
    function modulo(Instance memory _a, Instance memory _mod)
        private
        view
        returns (Instance memory)
    {
        Instance memory res;
        Instance memory one = from(0x1);
        res = modexp(_a, one, _mod);
        return res;
    }

    /** @dev Use the precompile to perform _base ^ _exp % _mod
     */
    function innerModExp(
        bytes memory _base,
        bytes memory _exp,
        bytes memory _mod
    ) private view returns (bytes memory) {
        bytes memory ret;
        assembly {
            let bl := mload(_base)
            let el := mload(_exp)
            let ml := mload(_mod)

            let freemem := mload(0x40) // Free memory pointer is always stored at 0x40

            mstore(freemem, bl) // arg[0] = base.length @ +0

            mstore(add(freemem, 0x20), el) // arg[1] = exp.length @ + 0x20

            mstore(add(freemem, 0x40), ml) // arg[2] = mod.length @ + 0x40

            // arg[3] = base.bits @ + 0x60
            // Use identity built-in (contract 0x4) as a cheap memcpy
            let success := staticcall(
                450,
                0x4,
                add(_base, 0x20),
                bl,
                add(freemem, 0x60),
                bl
            )

            // arg[4] = exp.bits @ +0x60+base.length
            let argBufferSize := add(0x60, bl)
            success := and(
                success,
                staticcall(
                    450,
                    0x4,
                    add(_exp, 0x20),
                    el,
                    add(freemem, argBufferSize),
                    el
                )
            )

            // arg[5] = mod.bits @ +0x60+base.length+exp.length
            argBufferSize := add(argBufferSize, el)
            success := and(
                success,
                staticcall(
                    0x1C2,
                    0x4,
                    add(_mod, 0x20),
                    ml,
                    add(freemem, argBufferSize),
                    ml
                )
            )

            // Total argBufferSize of input = 0x60+base.length+exp.length+mod.length
            argBufferSize := add(argBufferSize, ml)
            // Invoke contract 0x5, put return value right after mod.length, @ +0x60
            success := and(
                success,
                staticcall(
                    sub(gas(), 0x546),
                    0x5,
                    freemem,
                    argBufferSize,
                    add(0x60, freemem),
                    ml
                )
            )

            if iszero(success) {
                revert(0x0, 0x0)
            } //fail where we haven't enough gas to make the call

            let length := ml
            let resultPtr := add(0x60, freemem)

            ///the following code removes any leading words containing all zeroes in the result.
            for {

            } and(gt(length, 0x0), iszero(mload(resultPtr))) {

            } {
                resultPtr := add(resultPtr, 0x20) //push up the length pointer for the result..
                length := sub(length, 0x20) //and subtract a word (0x20 bytes) from the result length.
            }

            ret := sub(resultPtr, 0x20)
            mstore(ret, length)

            // point to the location of the return value (length, bits)
            //assuming mod length is multiple of 0x20, return value is already in the right format.
            // Otherwise, the offset needs to be adjusted.
            //function visibility is changed to internal to reflect this.
            //ret := add(0x40,freemem)

            mstore(0x40, add(add(0x60, freemem), ml)) //deallocate freemem pointer
        }
        return ret;
    }

    /** @dev Right shift instance 'dividend' by 'value' bits.
     * This clobbers the passed _dividend
     */
    function privateRightShift(Instance memory _dividend, uint256 _value)
        private
        pure
        returns (Instance memory)
    {
        bytes memory result;
        uint256 wordShifted;
        uint256 maskShift = 0x100 - _value;
        uint256 precedingWord;
        uint256 resultPtr;
        uint256 length = _dividend.value.length;

        require(_value == 0x2, "May only shift by 0x2");
        require(
            _dividend.value.length <= 1024,
            "Length must be less than 8192 bits"
        );

        assembly {
            resultPtr := add(mload(_dividend), length)
        }

        for (int256 i = int256(length) - 0x20; i >= 0x0; i -= 0x20) {
            //for each word:
            assembly {
                wordShifted := mload(resultPtr) //get next word
                switch iszero(i) //if i==0x0:
                case 0x1 {
                    precedingWord := 0x0
                } // handles msword: no precedingWord needed.
                default {
                    precedingWord := mload(sub(resultPtr, 0x20))
                } // else get precedingWord.
            }
            wordShifted >>= _value; //right shift current by value
            precedingWord <<= maskShift; // left shift next significant word by maskShift
            assembly {
                mstore(resultPtr, or(wordShifted, precedingWord))
            } // store OR'd precedingWord and shifted value in-place
            resultPtr -= 0x20; // point to next value.
        }

        assembly {
            //the following code removes any leading words containing all zeroes in the result.
            resultPtr := add(resultPtr, 0x20)
            for {

            } and(gt(length, 0x0), iszero(mload(resultPtr))) {

            } {
                resultPtr := add(resultPtr, 0x20) //push up the start pointer for the result..
                length := sub(length, 0x20) //and subtract a word (0x20 bytes) from the result length.
            }

            result := sub(resultPtr, 0x20)
            mstore(result, length)
        }

        _dividend.value = result;
        return _dividend;
    }
}
