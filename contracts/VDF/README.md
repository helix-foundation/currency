# The Verifiable Delay Function _(VDF)_
> Contract implementing the VDF, supporting testing code, and reference implementation of the off-the-chain Verifier.

VDF functionality is a part of the currency project and implements the following components:

1. VDFVerifier contract, implemented in Solidity. It follows the [Simple Verifiable Delay Functions](https://eprint.iacr.org/2018/627) method.
2. The reference Prover code written in JavaScript that runs during self-tests.

## Table of Contents
 - [Security](#security)
 - [Background](#background)
 - [Install](#install)
 - [Usage](#usage)
 - [API](#api)
 - [Additional Details](#additional-details)
 - [Contributing](#contributing)
 - [License](#license)

## Security
The recommended parameters for the VDF are a 2048-bit n, a 256-bit x, and t=40. t can be lower or higher, depending on the selected time window from the start of the commitment to x to the deadline to reveal y. See [Security Details Details](#security-details) for additional information.

## Background
The VDF contract is designed to support multiple concurrent Provers that interact with the contract through the `setXY`, a series of `verifyUpdate`, and `isVerified` calls. 

## Install
See the [main README](../../README.md) for installation instructions.

## Usage

## API

### constructor
Takes two arguments:
- `_t` - the delay parameter t; it defines that the contract expects y to be the result T=2\^t squarings of x
- `_n` - the RSA-style modulus n

### setXY
Takes two arguments:
- `_x` - the input x, at least 256 bits
- `_y` - the value x\^2\^T mod n, where T = 2\^t. t and n are specified in the constructor

### verifyUpdate
Takes two arguments:
- `_nextProgress` - the index of the step, starting from 1 and ending at t-1
- `_u` - the corresponding proof value u[i], where i = _nextProgress
The caller calls this function n-1 times. If each of these calls is successful, the `isVerified` will return true the last call. See the [VDF.js](../../test/VDF.js) for the details on the generation of each value u[i].

### isVerified
Takes one argument:
 - `_key` - the Keccak256 hash of the concatenation of t, n, x, and y, as big-endian integers, where the encoding of t and x are 32 bytes long and the remaining fields have length equal to nBytes, defined next. nBytes is the minimum number of octets that can hold the value n. There are no headers or separators in this encoding. The total length of thus formed message is always 64+2*nBytes bytes.

## Additional Details

### Security Details
x must be a 256-bit random uniformly-distributed number
The modulus n must be a product of two 1024-bit safe primes. It is critical that nobody knows factorization of the modulus n. A regular RSA modulus is not a suitable choice of n for two reasons: 
 - somebody may know factorization of n
 - the factors of n, p and q, are likely to have a property that p-1 or q-1 are products of primes shorter than ~100 bits (allowing low-order elements with probability higher than 2^-100).

The value of t must be sufficiently large for the selected time period. 

#### Selecting the value of t
Selection of the value t must take into consideration the available processing power and the length of time interval, as discussed next.

##### Processing power
 When determining the processing power, the major issue is the size of the internal integer, sometimes called the "limb size", used to implement operations modulo n. Clock speed is the secondary consideration of lower importance; in this section we assume the clock speed to be at 4Ghz, with the exception of the "Near future" column, which uses 5 Ghz.
 As of 2019 x86 AVX-512 instruction set provides the widest integer size available in x86 CPUs, which offers twice the width of previous instruction set AVX2, see [AVX2 and AVX-512](https://en.wikipedia.org/wiki/Advanced_Vector_Extensions). AVX2 instruction set corresponds to the "Budget, today" column in the table below. "Today" column corresponds to estimates using AVX-512 instruction set, and the "Near future" column assumes doubles the throughput of the AVX-512 instruction set.
 We assume that doubling the integer size results in a factor of 5 improvement to the speed of the square operation modulo n.
 
 The following table estimates the time needed to perform T=2^t squaring modulo n on 4-5 Ghz computers with a state-of-the-art implementation.
 
|  t | Near future |    Today | Budget, today
|----|------------:|---------:|-------------:|
| 33 |    100 sec  |  10 min  |      1 hr    |
| 40 |      4  hr  |  23  hr  |      5 days  |

##### Time interval
Let's assume that t=33 is selected. The Prover should pre-compute the pair of (x, y) ahead of time. It will take the Prover from 1 hr to 1 min, per single core, to accomplish this, depending on the selected CPU widely available for sale today. The commitment window for x should be under 1 min, ensuring that no attacker can compute y within this time.
This example leaves little room to possible advances in computational power, and larger values, e.g. t=40 or higher, should be considered with a similarly brief commitment window, measured in seconds.
Increasing t by 1 doubles every value in the row in the above table. 

### Current gas cost for VDF verification

2K modulus:

|  t  | Gas       | Cost @20 Gwei, in ETH  |
|-----|----------:|-----------------------:|
| 10  | 11091346  |                  0.221 |
| 20  | 23715545  |                  0.472 |

1K modulus (for comparison, outdated):

|  t  | Gas      | Cost @20 Gwei, in ETH  |
|-----|---------:|-----------------------:|
| 10  |  4814888 |                  0.096 |
| 20  | 10251939 |                  0.205 |

t is the number of iterations of the verifier. 

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md).


