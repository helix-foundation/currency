/* eslint-disable no-bitwise */

const commandLineArgs = require('command-line-args');
// eslint-disable-next-line import/no-extraneous-dependencies
const bigintCryptoUtils = require('bigint-crypto-utils');
const Web3 = require('web3');

const web3 = new Web3();

const {
  BN, toBN, soliditySha3, isBN,
} = web3.utils;

// RSA-2048 Challenge
// eslint-disable-next-line max-len
const defn = toBN('0xc7970ceedcc3b0754490201a7aa613cd73911081c790f5f1a8726f463550bb5b7ff0db8e1ea1189ec72f93d1650011bd721aeeacc2acde32a04107f0648c2813a31f5b0b7765ff8b44b4b6ffc93384b646eb09c7cf5e8592d40ea33c80039f35b4f14a04b51f7bfd781be4d1673164ba8eb991c2c4d730bbbe35f592bdef524af7e8daefd26c66fc02c479af89d64d373f442709439de66ceb955f3ea37d5159f6135809f85334b5cb1813addc80cd05609f10ac6a95ad65872c909525bdad32bc729592642920f24c61dc5b3c3b7923e56b16a4d9d373d8721f24a3fc0f1b3131f55615172866bccc30f95054c824e733a5eb6817f7bc16399d48c6361cc7e5');

// Return a hexadecimal string representation of BN, such that it is
// padded to padSize boundary with leading zeroes.
// Needed for BigNumber.sol.
function bnHex(bn, bytes = 0) {
  const bnBytes = bn.byteLength();
  if (bytes > 0) {
    return `0x${bn.toString('hex', bytes * 2)}`;
  }
  return `0x${bn.toString('hex', bnBytes * 2)}`;
}

// x, y are BNs: (x^2) ^ 2 ^ T =  x ^ 2 ^ (T+1) = y mod n
// T = 2^t
// x and y must be in Montgomery form (in proper n)
// returns an array of t-1 elements that are square roots, per algorithm
//
// The reason we start with x^2 (aka x = original_x^2) and not x, as in the Pietrzak's VDF paper,
// is that we must ensure that x is a quadratic residue, and pre-squaring x is the easiest.
function prove(x, t, n = defn) {
  const redctx = BN.mont(n);
  const xmont = x.toRed(redctx);
  const ymont = xmont.redSqr().redPow(toBN(2).pow(toBN(2).pow(toBN(t))));
  const y = ymont.fromRed();
  const bytelen = n.byteLength();

  // (x_i, y_i) invariants, in Montgomery form. Start with (x^2,y)

  let xi = xmont.redSqr(); // start with x = x^2
  let yi = ymont;

  const Usqrt = Array(t - 1); // set of t-1 proofs to return

  const two = toBN(2);
  for (let i = 0; i < t - 1; i += 1) {
    const uiprime = xi.redPow(two.pow(toBN((1 << (t - i - 1)) - 1))); // this is sqrt u_i
    const ui = uiprime.redSqr(); // u_i = u_i' ^ 2

    // save the intermediate values
    Usqrt[i] = uiprime.fromRed();

    // calculate r_i
    // (unfortunately, there is no easy way to copy hash context, so
    // rehash x and y)
    const res = web3.utils.soliditySha3(
      web3.utils.soliditySha3(x, bnHex(y, bytelen)),
      bnHex(uiprime.fromRed(), bytelen),
      i + 1,
    );
    const rbn = toBN(res);

    // set up x_i+1 and y_i+1
    xi = xi.redPow(rbn).redMul(ui); // xi = xi^r * u
    yi = ui.redPow(rbn).redMul(yi); // yi = u^r * yi
  }

  // check correctness:
  xi = xi.redSqr().redSqr(); // xi = xi^4

  return [y, Usqrt];
}

/* Expand a cryptographic key from a seed value to the supplied byte length
 * using keccak256 and a key stream counter to expand the key. This is a
 * pseudo-random permutation being used as a counter-based key derivation
 * function.
 */
function expandKey(seed, byteLength) {
  /* Convert the seed to a hex-encoded string representation if it was given in
   * the more natural BN format.
   */
  let seedData = seed;
  if (isBN(seedData)) {
    seedData = bnHex(seedData);
  }

  /* The final output should be 0x..., so start with the 0x already present.
   * The prefix will be stripped off of the representations that will be
   * concatenated to form the key.
   */
  let key = '0x';
  const counter = toBN(0);

  /* The key is constructed by repeatedly concatenating together the keccak256
   * of the concatenation of the seed and the counter until the key is at least
   * as long as the message. The counter is incremented at each step to ensure
   * that no two blocks of the key are the same.
   */
  while (key.length - 2 < 2 * byteLength) {
    const keyBytes = soliditySha3(
      {
        type: 'bytes',
        value: seedData,
      },
      {
        type: 'uint256',
        value: counter,
      },
    );

    counter.iaddn(1);

    key += keyBytes.replace('0x', '');
  }

  /* The key is easiest to work with as a BN, so convert it. We also likely
   * have more bytes that we want, so truncate the key to the number of bytes
   * requested.
   */
  return toBN(key.substring(0, (byteLength * 2) + 2));
}

/** Encrypt or decrypt a message using a symmetric encryption scheme. The key
 * is intended to be the output of a VDF construct, and is expanded to produce
 * a key long enough to be used as a block cipher for the provided data.
 *
 * The algorithm is its own inverse, so encrypt(encrypt(m, k), k) == m.
 *
 * @param message The message to encrypt or decrypt. This should be a BN or a
 *                hex string (with an optional prefix of '0x'), representing
 *                some consistent encoding of the data to encrypt. It is
 *                assumed that the message is already padded to byte
 *                boundaries.
 * @param keySeed The seed or key passed to the key derivation function to
 *                generate the block cipher key.
 * @return A hex-encoded string representation of the encrypted/decrypted
 *         message.
 */
function encrypt(message, keySeed) {
  /* Check the format of message and ensure its usable. Also, record the size
   * of the message so we know how many bytes of key we need to encrypt it.
   *
   * The size aspect is especially important because leading 0 bytes will be
   * lost when we convert to a BN to do the bitwise operations, but they are
   * important parts of the message. Using a key of the correct length will
   * still result in a correct representation of the final encrypted product.
   */
  let size;
  let data = message;
  if (!isBN(data) && !data.startsWith('0x')) {
    size = Math.ceil(data.length / 2);
    data = `0x${data}`;
  } else if (!isBN(data)) {
    size = Math.ceil((data.length - 2) / 2);
  } else {
    size = data.byteLength();
  }
  data = toBN(data);

  /* Check the format of the key/seed provided and convert it to something
   * usable.
   */
  let seed = keySeed;
  if (!isBN(seed) && !seed.startsWith('0x')) {
    seed = `0x${seed}`;
  }

  // Expand the provided seed into a full length key for the block cipher.
  const key = expandKey(seed, size);

  /* XOR the message and the key together, and convert the resulting BN to
   * a hex-encoded string of the appropriate byte length.
   */
  return bnHex(data.xor(key), size);
}

async function proveAndReveal(inflation, seed, voter) {
  const VDFVerifier = artifacts.require('VDFVerifier');

  const vdf = await VDFVerifier.at(await inflation.vdfVerifier());
  const difficulty = await inflation.votingVDFDifficulty();
  const [key, proof] = prove(toBN(seed), difficulty);

  await vdf.start(bnHex(toBN(seed)), difficulty, bnHex(key), { from: voter });
  for (let i = 0; i < proof.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await vdf.update(bnHex(proof[i]), { from: voter });
  }

  return [key, await inflation.reveal(voter, bnHex(key), { from: voter })];
}

async function randomSeed() {
  return toBN((await bigintCryptoUtils.prime(256, 10)).toString());
}

module.exports = {
  n: defn,
  bnHex,
  prove,
  encrypt,
  decrypt: encrypt,
  proveAndReveal,
  randomSeed,
};

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
  ];

  const options = commandLineArgs(OPT_DEFS);
  process.stdout.write(JSON.stringify(prove(toBN(options.x), toBN(options.t))));
  process.stdout.write('\n');
}
