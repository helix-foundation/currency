/* eslint-disable no-await-in-loop, no-loop-func */

const IsPrime = artifacts.require('IsPrime');
const bigintCryptoUtils = require('bigint-crypto-utils');

const { toBN } = web3.utils;

const MILLER_RABIN_ITERATIONS = 20;

contract('IsPrime [@group=8]', () => {
  let instance;

  before(async () => {
    instance = await IsPrime.new();
  });

  for (let i = 0; i < 100; i += 1) {
    it(`Primality tests ${i}`, async () => {
      const isPrime = await bigintCryptoUtils.isProbablyPrime(BigInt(i));
      assert.strictEqual(
        await instance.isProbablePrime(i, MILLER_RABIN_ITERATIONS),
        isPrime,
      );
    });
  }

  for (let i = 0; i < 100; i += 1) {
    // eslint-disable-next-line no-bitwise
    const rnd = bigintCryptoUtils.randBetween(BigInt(2) ** BigInt(256)) | BigInt(1);
    it(`Primality test ${rnd.toString()}`, async () => {
      const isPrime = await bigintCryptoUtils.isProbablyPrime(rnd);
      assert.strictEqual(
        await instance.isProbablePrime(
          toBN(rnd.toString()),
          MILLER_RABIN_ITERATIONS,
        ),
        isPrime,
      );
    });
  }
});
