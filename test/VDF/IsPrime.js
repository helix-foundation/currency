/* eslint-disable no-await-in-loop, no-loop-func */
const { assert } = require('chai');
const { BigNumber } = require('ethers');

const bigintCryptoUtils = require('bigint-crypto-utils');
const { deploy } = require('../utils/contracts');

const MILLER_RABIN_ITERATIONS = 20;

describe('IsPrime [@group=8]', () => {
  let instance;

  before(async () => {
    instance = await deploy('IsPrime');
  });

  for (let i = 0; i < 100; i += 1) {
    it(`Primality tests ${i}`, async () => {
      const isPrime = await bigintCryptoUtils.isProbablyPrime(BigInt(i));
      assert.strictEqual(await instance.isProbablePrime(i, MILLER_RABIN_ITERATIONS), isPrime);
    });
  }

  it('Primality tests number with many trailing binary zeros', async () => {
    const bigPow = BigInt(2) ** BigInt(255) + BigInt(1);
    const isPrime = await bigintCryptoUtils.isProbablyPrime(bigPow);
    assert.strictEqual(await instance.isProbablePrime(bigPow, MILLER_RABIN_ITERATIONS), isPrime);
  });

  for (let i = 0; i < 100; i += 1) {
    // eslint-disable-next-line no-bitwise
    const rnd = bigintCryptoUtils.randBetween(BigInt(2) ** BigInt(256)) | BigInt(1);
    it(`Primality test ${rnd.toString()}`, async () => {
      const isPrime = await bigintCryptoUtils.isProbablyPrime(rnd);
      assert.strictEqual(
        await instance.isProbablePrime(BigNumber.from(rnd.toString()), MILLER_RABIN_ITERATIONS),
        isPrime,
      );
    });
  }
});
