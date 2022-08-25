/* eslint-disable no-bitwise */

const commandLineArgs = require('command-line-args')
const BN = require('bn.js')

// RSA-2048 Challenge
// eslint-disable-next-line max-len
const defn = new BN(
  'c7970ceedcc3b0754490201a7aa613cd73911081c790f5f1a8726f463550bb5b7ff0db8e1ea1189ec72f93d1650011bd721aeeacc2acde32a04107f0648c2813a31f5b0b7765ff8b44b4b6ffc93384b646eb09c7cf5e8592d40ea33c80039f35b4f14a04b51f7bfd781be4d1673164ba8eb991c2c4d730bbbe35f592bdef524af7e8daefd26c66fc02c479af89d64d373f442709439de66ceb955f3ea37d5159f6135809f85334b5cb1813addc80cd05609f10ac6a95ad65872c909525bdad32bc729592642920f24c61dc5b3c3b7923e56b16a4d9d373d8721f24a3fc0f1b3131f55615172866bccc30f95054c824e733a5eb6817f7bc16399d48c6361cc7e5',
  16
)

// Return a hexadecimal string representation of BN, such that it is
// padded to padSize boundary with leading zeroes.
// Needed for BigNumber.sol.
function bnHex(bnInput, bytes = 0) {
  const bn = new BN(bnInput.toString())
  const bnBytes = bn.byteLength()
  if (bytes > 0) {
    return `0x${bn.toString('hex', bytes * 2)}`
  }
  return `0x${bn.toString('hex', bnBytes * 2)}`
}

// x, y are BNs: (x^2) ^ 2 ^ T =  x ^ 2 ^ (T+1) = y mod n
// T = 2^t
// x and y must be in Montgomery form (in proper n)
// returns an array of t-1 elements that are square roots, per algorithm
//
// The reason we start with x^2 (aka x = original_x^2) and not x, as in the Pietrzak's VDF paper,
// is that we must ensure that x is a quadratic residue, and pre-squaring x is the easiest.
function prove(x, tinput, n = defn) {
  const t = Number(tinput.toString())
  const two = new BN(2)
  const redctx = BN.mont(n)
  const xmont = (new BN(x.toString())).toRed(redctx)
  const ymont = xmont.redSqr().redPow(two.pow(two.pow(new BN(t))))
  const y = ymont.fromRed()
  const bytelen = n.byteLength()

  // (x_i, y_i) invariants, in Montgomery form. Start with (x^2,y)
  let xi = xmont.redSqr() // start with x = x^2
  let yi = ymont

  const Usqrt = Array(t - 1) // set of t-1 proofs to return

  for (let i = 0; i < t - 1; i += 1) {
    const uiprime = xi.redPow(two.pow(new BN((1 << (t - i - 1)) - 1))) // this is sqrt u_i
    const ui = uiprime.redSqr() // u_i = u_i' ^ 2

    // save the intermediate values
    Usqrt[i] = uiprime.fromRed()

    // calculate r_i
    const res = ethers.utils.solidityKeccak256(
      ['bytes32', 'bytes', 'uint256'],
      [
        ethers.utils.solidityKeccak256(
          ['uint256', 'bytes'],
          [x.toString(), bnHex(y, bytelen)]
        ),
        bnHex(uiprime.fromRed(), bytelen),
        i + 1,
      ]
    )
    const rbn = new BN(res.slice(2), 16)

    // set up x_i+1 and y_i+1
    xi = xi.redPow(rbn).redMul(ui) // xi = xi^r * u
    yi = ui.redPow(rbn).redMul(yi) // yi = u^r * yi
  }

  // check correctness:
  xi = xi.redSqr().redSqr() // xi = xi^4

  return [y, Usqrt]
}

module.exports = {
  n: defn,
  bnHex,
  prove,
}

if (typeof require !== 'undefined' && require.main === module) {
  const OPT_DEFS = [
    {
      name: 'x',
      type: String,
      defaultValue: '',
    },
    {
      name: 't',
      type: String,
      defaultValue: '',
    },
  ]

  const options = commandLineArgs(OPT_DEFS)
  process.stdout.write(
    JSON.stringify(prove(new BN(options.x), new BN(options.t)))
  )
  process.stdout.write('\n')
}
