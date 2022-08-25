/* eslint-disable no-await-in-loop, no-nested-ternary */

const { ethers } = require('hardhat')
const snapshotGasCost = require('@uniswap/snapshot-gas-cost').default
const BN = require('bn.js')

const { deploy } = require('../utils/contracts')

describe('BigNumber [@group=3]', () => {
  let bignum

  before(async () => {
    bignum = await deploy('BigNum')
  })

  describe('Input', () => {
    it('Rejects malformed bigint bytes', async () => {
      await expect(bignum.fromBytes('0x0001')).to.be.revertedWith(
        'High-byte must be set for non-256bit-aligned numbers'
      )
    })

    it('Rejects malformed bigint words', async () => {
      const bigone = `0x${'00'.repeat(63)}01`
      await expect(bignum.fromBytes(bigone)).to.be.revertedWith(
        'High-word must be set for 256bit-aligned numbers'
      )
    })

    it('Matches 1', async () => {
      expect(await bignum.fromUint(1)).to.equal('0x01')
    })

    it('Matches uint 0', async () => {
      expect(await bignum.fromUint(0)).to.equal('0x')
    })

    it('Matches byte 0', async () => {
      expect(await bignum.fromBytes('0x')).to.equal('0x')
    })

    it('Matches byte 1', async () => {
      expect(await bignum.fromBytes('0x01')).to.equal('0x01')
    })

    it('Matches padded byte 1', async () => {
      const one = `0x${'00'.repeat(31)}01`
      expect(await bignum.fromBytes(one)).to.equal('0x01')
    })

    it('Rejects asBytes size too small', async () => {
      await expect(
        bignum.asBytes(`0x${'ff'.repeat(64)}`, 32)
      ).to.be.revertedWith('Number too large to represent')
    })

    it('Rejects invalid asBytes', async () => {
      await expect(bignum.asBytes('0x01', 33)).to.be.revertedWith(
        'Size must be multiple of 0x20'
      )
    })

    it('Rejects invalid rightShift value', async () => {
      await expect(bignum.rightShift('0x01', 4)).to.be.revertedWith(
        'May only shift by 0x2'
      )
    })

    it('Rejects invalid rightShift input', async () => {
      await expect(
        bignum.rightShift(`0x${'ff'.repeat(1092)}`, 2)
      ).to.be.revertedWith('Length must be less than 8192 bits')
    })

    it('fromBytes with one byte less than a whole word', async () => {
      expect(
        await bignum.fromBytes(
          '0xd2e9ea92ccee6456e017363666e41169e73466c0238983d47864e121b741d78348c39ff18627137ab25b4a7a2dde2fa3e3d05e8396c7b61cf752bb5b7490f3622a4639e9b46eb541b9d4644ba3d423af9d5fc4ef419c2ce2f32915ec52169efa0a773fbc6b94a2869d910fb0d97d613a712844e5abfbf774713efcc767dfa8178b201e54b3a060e1c618ff3f49c6dcbda7f94b7beb59b74eea8da0c7c7bb2e13e564fbb4bd5d0fb7e4a96cd3c8f0f0b7504c9e9e1fe4e6e308a01156aa33a650a62024e04cefe7f7cea1bf4d634a904921cd24af684715c0803253338f1ab024e31af141faa882d8af7c901135f31b51abb9a3854aafa45a7ab63422baf972'
        )
      ).to.equal(
        '0xd2e9ea92ccee6456e017363666e41169e73466c0238983d47864e121b741d78348c39ff18627137ab25b4a7a2dde2fa3e3d05e8396c7b61cf752bb5b7490f3622a4639e9b46eb541b9d4644ba3d423af9d5fc4ef419c2ce2f32915ec52169efa0a773fbc6b94a2869d910fb0d97d613a712844e5abfbf774713efcc767dfa8178b201e54b3a060e1c618ff3f49c6dcbda7f94b7beb59b74eea8da0c7c7bb2e13e564fbb4bd5d0fb7e4a96cd3c8f0f0b7504c9e9e1fe4e6e308a01156aa33a650a62024e04cefe7f7cea1bf4d634a904921cd24af684715c0803253338f1ab024e31af141faa882d8af7c901135f31b51abb9a3854aafa45a7ab63422baf972'
      )
    })

    it('fromBytes with one word', async () => {
      expect(
        await bignum.fromBytes(
          '0xd2e9ea92ccee6456e017363666e41169e73466c0238983d47864e121b741d783'
        )
      ).to.equal(
        '0xd2e9ea92ccee6456e017363666e41169e73466c0238983d47864e121b741d783'
      )
    })
  })

  describe('Math', () => {
    const n = 'ff'.repeat(32)
    const z = '00'.repeat(32)
    const p = `${'00'.repeat(31)}01`

    describe('Simple ops', () => {
      const list = [
        '0x',
        `0x${n}`,
        `0x${p}`,
        `0x${n}${n}`,
        `0x${n}${z}`,
        `0x${n}${p}`,
        `0x${p}${n}`,
        `0x${p}${z}`,
        `0x${p}${p}`,
      ]
      list.forEach((a) => {
        list.forEach((b) => {
          const bigA =
            a === '0x' ? ethers.BigNumber.from(0) : ethers.BigNumber.from(a)
          const bigB =
            b === '0x' ? ethers.BigNumber.from(0) : ethers.BigNumber.from(b)

          it(`${a} + ${b}`, async () => {
            const r = await bignum.add(a, b)
            const e = bigA.add(bigB)

            if (e.eq(0)) {
              expect(r).to.equal('0x')
            } else {
              expect(r).to.equal(e.toHexString())
            }
          })

          it(`abs(${a} - ${b})`, async () => {
            const r = await bignum.absdiff(a, b)
            const e = bigA.sub(bigB).abs()

            if (e.eq(0)) {
              expect(r).to.equal('0x')
            } else {
              expect(r).to.equal(e)
            }
          })

          it(`${a} <=> ${b}`, async () => {
            const r = await bignum.cmp(a, b)
            const e = bigA.eq(bigB) ? 0 : bigA.gt(bigB) ? 1 : -1
            expect(r).to.equal(e)
          })
        })
      })
    })

    describe('Multiplicative', () => {
      const list = [
        `0x${n}`,
        `0x${p}`,
        `0x${n}${n}`,
        `0x${n}${z}`,
        `0x${n}${p}`,
        `0x${p}${n}`,
        `0x${p}${z}`,
        `0x${p}${p}`,
      ]
      const modulos = [
        `0x${n}`,
        `0x${n}${n}`,
        `0x${n}${z}`,
        `0x${n}${p}`,
        `0x${p}${n}`,
        `0x${p}${z}`,
        `0x${p}${p}`,
        `0x${'ff'.repeat(256)}`,
      ]
      list.forEach((a) => {
        list.forEach((b) => {
          modulos.forEach((c) => {
            it(`${a} * ${b} % ${c}`, async () => {
              const bigA =
                a === '0x' ? ethers.BigNumber.from(0) : ethers.BigNumber.from(a)
              const bigB =
                b === '0x' ? ethers.BigNumber.from(0) : ethers.BigNumber.from(b)
              const bigC =
                c === '0x' ? ethers.BigNumber.from(0) : ethers.BigNumber.from(c)
              const r = await bignum.modmul(a, b, c)
              const e = bigA.mul(bigB).mod(bigC)
              if (e.eq(0)) {
                expect(r).to.equal('0x')
              } else {
                expect(r).to.equal(e)
              }
            })

            it(`${a} ** ${b} % ${c}`, async () => {
              const r = await bignum.modexp(a, b, c)
              // BigNumber pow is too slow with high values so we keep BN here for now
              const red = BN.red(new BN(c.slice(2), 16))
              const e = new BN(a.slice(2), 16)
                .toRed(red)
                .redPow(new BN(b.slice(2), 16))
                .fromRed()
              if (e.eqn(0)) {
                expect(r).to.equal('0x')
              } else {
                expect(new BN(r.slice(2), 16)).to.eq(e)
              }
            })
          })
        })
      })
    })

    if (!process.env.IS_COVERAGE) {
      describe('gas', () => {
        describe('fromBytes', async () => {
          it('0x', async () => {
            await snapshotGasCost(bignum.estimateGas.fromBytes('0x'))
          })

          it('0x1234', async () => {
            await snapshotGasCost(bignum.estimateGas.fromBytes('0x1234'))
          })

          it('Max Uint256', async () => {
            await snapshotGasCost(
              bignum.estimateGas.fromBytes(
                ethers.constants.MaxUint256.toHexString()
              )
            )
          })
        })

        describe('fromUint', async () => {
          it('0', async () => {
            await snapshotGasCost(bignum.estimateGas.fromUint(0))
          })

          it('1234', async () => {
            await snapshotGasCost(bignum.estimateGas.fromUint(1234))
          })

          it('Max Uint256', async () => {
            await snapshotGasCost(
              bignum.estimateGas.fromUint(ethers.constants.MaxUint256)
            )
          })
        })

        describe('add', async () => {
          it('1 + 5', async () => {
            const one = `0x${'00'.repeat(31)}01`
            const five = `0x${'00'.repeat(31)}05`
            await snapshotGasCost(bignum.estimateGas.add(one, five))
          })

          it('Max Uint256 + Max Uint256', async () => {
            await snapshotGasCost(
              bignum.estimateGas.add(
                ethers.constants.MaxUint256.toHexString(),
                ethers.constants.MaxUint256.toHexString()
              )
            )
          })
        })

        describe('absdiff', async () => {
          it('1 - 5', async () => {
            const one = `0x${'00'.repeat(31)}01`
            const five = `0x${'00'.repeat(31)}05`
            await snapshotGasCost(bignum.estimateGas.absdiff(one, five))
          })

          it('Max Uint256 - Max Uint256', async () => {
            await snapshotGasCost(
              bignum.estimateGas.absdiff(
                ethers.constants.MaxUint256.toHexString(),
                ethers.constants.MaxUint256.toHexString()
              )
            )
          })
        })

        describe('modmul', async () => {
          it('5 % 2 * 3', async () => {
            const five = `0x${'00'.repeat(31)}05`
            const two = `0x${'00'.repeat(31)}02`
            const three = `0x${'00'.repeat(31)}03`
            await snapshotGasCost(bignum.estimateGas.modmul(five, two, three))
          })

          it('Max Uint256 % 7 * Max Uint256', async () => {
            const seven = `0x${'00'.repeat(31)}07`
            await snapshotGasCost(
              bignum.estimateGas.modmul(
                ethers.constants.MaxUint256.toHexString(),
                seven,
                ethers.constants.MaxUint256.toHexString()
              )
            )
          })
        })

        describe('modexp', async () => {
          it('5 % 2 ** 3', async () => {
            const five = `0x${'00'.repeat(31)}05`
            const two = `0x${'00'.repeat(31)}02`
            const three = `0x${'00'.repeat(31)}03`
            await snapshotGasCost(bignum.estimateGas.modexp(five, two, three))
          })

          it('Max Uint256 % 7 ** Max Uint256', async () => {
            const seven = `0x${'00'.repeat(31)}07`
            await snapshotGasCost(
              bignum.estimateGas.modexp(
                ethers.constants.MaxUint256.toHexString(),
                seven,
                ethers.constants.MaxUint256.toHexString()
              )
            )
          })
        })

        describe('cmp', async () => {
          it('5 cmp 2', async () => {
            const five = `0x${'00'.repeat(31)}05`
            const two = `0x${'00'.repeat(31)}02`
            await snapshotGasCost(bignum.estimateGas.cmp(five, two))
          })

          it('Max Uint256 cmp Max Uint256', async () => {
            await snapshotGasCost(
              bignum.estimateGas.cmp(
                ethers.constants.MaxUint256.toHexString(),
                ethers.constants.MaxUint256.toHexString()
              )
            )
          })
        })
      })
    }
  })
})
