/* eslint-disable no-await-in-loop, no-loop-func */
import { expect } from 'chai'
import { IsPrime } from '../../typechain-types'
const bigintCryptoUtils = require('bigint-crypto-utils')
const { deploy } = require('../utils/contracts')

const MILLER_RABIN_ITERATIONS = 25

describe('IsPrime [@group=8]', () => {
  let instance: IsPrime

  before(async () => {
    instance = await deploy('IsPrime')
  })

  for (let i = 0; i < 100; i += 1) {
    it(`Primality tests ${i}`, async () => {
      const isPrime = await bigintCryptoUtils.isProbablyPrime(BigInt(i))
      expect(
        await instance.isProbablePrime(i, MILLER_RABIN_ITERATIONS)
      ).to.equal(isPrime)
    })
  }

  it('Primality tests number with many trailing binary zeros', async () => {
    const bigPow = BigInt(2) ** BigInt(255) + BigInt(1)
    const isPrime = await bigintCryptoUtils.isProbablyPrime(bigPow)
    expect(
      await instance.isProbablePrime(bigPow, MILLER_RABIN_ITERATIONS)
    ).to.equal(isPrime)
  })

  for (let i = 0; i < 100; i += 1) {
    // eslint-disable-next-line no-bitwise
    const rnd =
      bigintCryptoUtils.randBetween(BigInt(2) ** BigInt(256)) | BigInt(1)
    it(`Primality test ${rnd}`, async () => {
      const isPrime = await bigintCryptoUtils.isProbablyPrime(rnd)
      expect(
        await instance.isProbablePrime(rnd, MILLER_RABIN_ITERATIONS)
      ).to.equal(isPrime)
    })
  }
})
