# The Verifiable Delay Function _(VDF)_
> Contract implementing the VDF, supporting testing code, and reference implementation for the off-the-chain Verifier.

VDF functionality is a tool for Random Inflation and implements the following components:

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
The recommended parameters for the VDF are a 2048-bit n, a 256-bit x, and t=40. t can be lower or higher, depending on the selected time window from the start of the commitment to x to the deadline to reveal y. finding a valid prime x such that x^2 is also a false positive to the primality test is too hard of a constraint on the attacker. The value of x is controlled by a potential attacker, but is highly limited (must be within 1000 after the previous blockhash, caste as a uint256). This does not guarantee that any such malicious x is valid. See [Security Details](#security-details) for additional information.

## Background
The contract holds a constant `N` which is the RSA-style modulus. 2048-bit modulus is from the RSA-2048 challenge https://en.wikipedia.org/wiki/RSA_Factoring_Challenge. This feature's security assumptions rely on RSA challenge rules: no attacker knows or can obtain the factorization, and factorization wasn't recorded on generation of the number.

## Install
See the [main README](../../README.md) for installation instructions.

## Usage
The VDF contract is designed to support multiple concurrent Provers that interact with the contract through the `start`, a series of `update`, and `isVerified` calls. Each user's interactions are stored in the mapping `state` that maps the users address to a custom struct that records the delay parameter `t` the value `x` the goal value `y` and the intermediate step values `xi` and `yi` as well as the `progress` which is the value of the iterator from 1 to t-1. Verified sets of `x`, `t`, and `y` are stored in a mapping from `keccak256(t,x)` to `keccak256(y)` which only is filled when the set is verified.

## API

### Events
#### SuccessfulVerification
Attributes:
  - `x` (uint256) - the input x, at least 256 bits
  - `t` (uint256) - the delay parameter t; it defines that the contract expects y to be the result T=2\^t squarings of x
  - `y` (bytes) - the value x\^2\^T mod n, where T = 2\^t. n is specified as a constant. Passed as bytes because it
    could be too large a number.

Emitted when `x`, `t`, and `y` are successfully verified.

### start
Arguments:
  - `_x` (uint256) - the input x, at least 256 bits
  - `_t` (uint256) - the delay parameter t; it defines that the contract expects y to be the result T=2\^t squarings of x
  - `_ybytes` (bytes) - the value x\^2\^T mod n, where T = 2\^t. n is specified as a constant. Passed as bytes because it
    could be too large a number.

Initiates the store of state for the `msg.sender` and validates the inputs.

#### Security Notes
 - `t` must be at least 2
 - `x` must be at least 2
 - `y` must be at least 512 bit long
 - `y` must be less than `N`
 - `x` is not constrained to be probable prime as the protocol enforces that elsewhere, however proving a non-prime x will not be constrained to the expected time window as expected.

### update
Arguments:
  - `_ubytes` (bytes) - the corresponding proof value u[i], where i = _nextProgress

The caller calls this function n-1 times. If each of these calls is successful, the `isVerified` will return true the last call. See the [vdf.js](../../tools/vdf.js) for the details on the generation of each value u[i]. On the final call of `update` it checks for verification and then records and emits an event if successful, then deletes the user's state as it is no longer needed.

### isVerified
Arguments:
  - `_x` (uint256) - the input x, at least 256 bits
  - `_t` (uint256) - the delay parameter t; it defines that the contract expects y to be the result T=2\^t squarings of x
  - `_ybytes` (bytes) - the value x\^2\^T mod n, where T = 2\^t. n is specified as a constant. Passed as bytes because it
    could be too large a number.

Verifies and returns true if verified.

### Security Details
x must be a 256-bit random uniformly-distributed prime number for effectiveness. The modulus n must be a product of two 1024-bit safe primes. It is critical that nobody knows factorization of the modulus n. A regular RSA modulus is not a suitable choice of n for two reasons: 
 - somebody may know factorization of n
 - the factors of n, p and q, are likely to have a property that p-1 or q-1 are products of primes shorter than ~100 bits (allowing low-order elements with probability higher than 2^-100).

The value of t must be sufficiently large for the selected time period. 

#### Selecting the value of t
Selection of the value t must take into consideration the available processing power and the length of time interval, as discussed next.

##### Processing power
 When determining the processing power, the major issue is the size of the internal integer, sometimes called the "limb size", used to implement operations modulo n. Clock speed is the secondary consideration of lower importance; in this section the clock speed is assumed to be at 4Ghz, with the exception of the "Near future" column, which uses 5 Ghz.
 As of 2019 x86 AVX-512 instruction set provides the widest integer size available in x86 CPUs, which offers twice the width of previous instruction set AVX2, see [AVX2 and AVX-512](https://en.wikipedia.org/wiki/Advanced_Vector_Extensions). AVX2 instruction set corresponds to the "Budget, today" column in the table below. "Today" column corresponds to estimates using AVX-512 instruction set, and the "Near future" column assumes doubles the throughput of the AVX-512 instruction set.
 It is presumed that doubling the integer size results in a factor of 5 improvement to the speed of the square operation modulo n.
 
 The following table estimates the time needed to perform T=2^t squaring modulo n on 4-5 Ghz computers with a state-of-the-art implementation.
 
|  t | Near future |    Today | Budget, today
|----|------------:|---------:|-------------:|
| 33 |    100 sec  |  10 min  |      1 hr    |
| 40 |      4  hr  |  23  hr  |      5 days  |

##### Time interval
Let's assume that t=33 is selected. The Prover should pre-compute the pair of (x, y) ahead of time. It will take the Prover from 1 hr to 10 min, per single core, to accomplish this, depending on the selected CPU widely available for sale today. The commitment window for x should be under 10 min, ensuring that no attacker can compute y within this time.
This example leaves little room to possible advances in computational power, and larger values, e.g. t=40 or higher, should be considered with a similarly brief commitment window, measured in seconds.
Increasing t by 1 doubles every value in the row in the above table. 

### Current gas cost for VDF verification

2K modulus:

|  t  | Gas       | Cost @20 Gwei, in ETH  |
|-----|----------:|-----------------------:|
| 10  |  4285030  |                  0.085 |
| 20  |  8168264  |                  0.163 |

t is the number of iterations of the verifier. 

## Contributing
See the [main README](../../README.md).

## License
See the [main README](../../README.md).


