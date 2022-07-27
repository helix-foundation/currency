/* eslint-disable no-await-in-loop, no-loop-func */
import { expect, assert } from 'chai';
import { advanceBlocks } from '../utils/time';
import { IsPrime } from '../../typechain-types';

const bigintCryptoUtils = require('bigint-crypto-utils');
const { deploy } = require('../utils/contracts');

const MILLER_RABIN_ITERATIONS = 20;

describe('IsPrime [@group=8]', () => {
  let instance: IsPrime;

  before(async () => {
    instance = await deploy('IsPrime');
  });

  it('should revert if primal not set in prior block', async () => {
    await instance.setPrimal(123);
    await expect(
      instance.isProbablePrime(MILLER_RABIN_ITERATIONS)
    ).to.be.revertedWith('Primal block must be before current');
  });

  for (let i = 0; i < 100; i += 1) {
    it(`Primality tests ${i}`, async () => {
      const isPrime = await bigintCryptoUtils.isProbablyPrime(BigInt(i));
      await instance.setPrimal(i);
      await advanceBlocks(1);
      assert.strictEqual(
        await instance.isProbablePrime(MILLER_RABIN_ITERATIONS),
        isPrime
      );
    });
  }

  it('Primality tests number with many trailing binary zeros', async () => {
    const bigPow = BigInt(2) ** BigInt(255) + BigInt(1);
    const isPrime = await bigintCryptoUtils.isProbablyPrime(bigPow);
    await instance.setPrimal(bigPow);
    await advanceBlocks(1);
    assert.strictEqual(
      await instance.isProbablePrime(MILLER_RABIN_ITERATIONS),
      isPrime
    );
  });

  for (let i = 0; i < 100; i += 1) {
    // eslint-disable-next-line no-bitwise
    const rnd =
      bigintCryptoUtils.randBetween(BigInt(2) ** BigInt(256)) | BigInt(1);
    it(`Primality test ${rnd.toString()}`, async () => {
      const isPrime = await bigintCryptoUtils.isProbablyPrime(rnd);
      await instance.setPrimal(rnd);
      await advanceBlocks(1);
      assert.strictEqual(
        await instance.isProbablePrime(MILLER_RABIN_ITERATIONS),
        isPrime
      );
    });
  }
});
