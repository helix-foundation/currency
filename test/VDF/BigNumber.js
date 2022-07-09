/* eslint-disable no-await-in-loop */

const { assert, expect } = require('chai');

const { ethers } = require('hardhat');
const snapshotGasCost = require('@uniswap/snapshot-gas-cost').default;
const BN = require('bn.js');

const { deploy } = require('../utils/contracts');

const { BigNumber } = ethers;

describe('BigNumber [@group=3]', () => {
  let bignum;

  before(async () => {
    bignum = await deploy('BigNum');
  });

  describe('Input', () => {
    it('Rejects malformed bigint bytes', async () => {
      await expect(bignum.fromBytes('0x0001')).to.be.revertedWith(
        'High-byte must be set for non-256bit-aligned number',
      );
    });

    it('Rejects malformed bigint words', async () => {
      const bigone = `0x${'00'.repeat(63)}01`;
      await expect(bignum.fromBytes(bigone)).to.be.revertedWith(
        'High-word must be set for 256bit-aligned numbers',
      );
    });

    it('Matches 1', async () => {
      assert.equal(await bignum.fromUint(1), '0x01');
    });

    it('Matches uint 0', async () => {
      assert.equal(await bignum.fromUint(0), '0x');
    });

    it('Matches byte 0', async () => {
      assert.equal(await bignum.fromBytes('0x'), '0x');
    });
  });

  describe('Math', () => {
    const n = 'ff'.repeat(32);
    const z = '00'.repeat(32);
    const p = `${'00'.repeat(31)}01`;

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
      ];
      list.forEach((a) => {
        list.forEach((b) => {
          const bigA = a === '0x' ? BigNumber.from(0) : BigNumber.from(a);
          const bigB = b === '0x' ? BigNumber.from(0) : BigNumber.from(b);

          it(`${a} + ${b}`, async () => {
            const r = await bignum.add(a, b);
            const e = bigA.add(bigB);

            if (e.eq(0)) {
              expect(r).to.equal('0x');
            } else {
              expect(r).to.equal(e);
            }
          });

          it(`abs(${a} - ${b})`, async () => {
            const r = await bignum.absdiff(a, b);
            const e = bigA.sub(bigB).abs();

            if (e.eq(0)) {
              expect(r).to.equal('0x');
            } else {
              expect(r).to.equal(e);
            }
          });

          it(`${a} <=> ${b}`, async () => {
            const r = await bignum.cmp(a, b);
            const e = bigA.eq(bigB) ? 0 : bigA.gt(bigB) ? 1 : -1;
            expect(r).to.equal(e);
          });
        });
      });
    });

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
      ];
      const modulos = [
        `0x${n}`,
        `0x${n}${n}`,
        `0x${n}${z}`,
        `0x${n}${p}`,
        `0x${p}${n}`,
        `0x${p}${z}`,
        `0x${p}${p}`,
        `0x${'ff'.repeat(256)}`,
      ];
      list.forEach((a) => {
        list.forEach((b) => {
          modulos.forEach((c) => {
            it(`${a} * ${b} % ${c}`, async () => {
              const bigA = a === '0x' ? BigNumber.from(0) : BigNumber.from(a);
              const bigB = b === '0x' ? BigNumber.from(0) : BigNumber.from(b);
              const bigC = c === '0x' ? BigNumber.from(0) : BigNumber.from(c);
              const r = await bignum.modmul(a, b, c);
              const e = bigA.mul(bigB).mod(bigC);
              if (e.eq(0)) {
                expect(r).to.equal('0x');
              } else {
                expect(r).to.equal(e);
              }
            });

            it(`${a} ** ${b} % ${c}`, async () => {
              const r = await bignum.modexp(a, b, c);
              // BigNumber pow is too slow with high values so we keep BN here for now
              const red = BN.red(new BN(c.slice(2), 16));
              const e = new BN(a.slice(2), 16).toRed(red).redPow(new BN(b.slice(2), 16)).fromRed();
              if (e.eqn(0)) {
                expect(r).to.equal('0x');
              } else {
                console.log(r);
                expect(new BN(r.slice(2), 16).eq(e)).to.be.true;
              }
            });
          });
        });
      });
    });

    if (!process.env.IS_COVERAGE) {
      describe('gas', () => {
        describe('fromBytes', async () => {
          it('0x', async () => {
            await snapshotGasCost(bignum.estimateGas.fromBytes('0x'));
          });

          it('0x1234', async () => {
            await snapshotGasCost(bignum.estimateGas.fromBytes('0x1234'));
          });

          it('Max Uint256', async () => {
            await snapshotGasCost(
              bignum.estimateGas.fromBytes(ethers.constants.MaxUint256.toHexString()),
            );
          });
        });

        describe('fromUint', async () => {
          it('0', async () => {
            await snapshotGasCost(bignum.estimateGas.fromUint(0));
          });

          it('1234', async () => {
            await snapshotGasCost(bignum.estimateGas.fromUint(1234));
          });

          it('Max Uint256', async () => {
            await snapshotGasCost(bignum.estimateGas.fromUint(ethers.constants.MaxUint256));
          });
        });

        describe('add', async () => {
          it('1 + 5', async () => {
            const one = `0x${'00'.repeat(31)}01`;
            const five = `0x${'00'.repeat(31)}05`;
            await snapshotGasCost(bignum.estimateGas.add(one, five));
          });

          it('Max Uint256 + Max Uint256', async () => {
            await snapshotGasCost(bignum.estimateGas.add(
              ethers.constants.MaxUint256.toHexString(),
              ethers.constants.MaxUint256.toHexString(),
            ));
          });
        });

        describe('absdiff', async () => {
          it('1 - 5', async () => {
            const one = `0x${'00'.repeat(31)}01`;
            const five = `0x${'00'.repeat(31)}05`;
            await snapshotGasCost(bignum.estimateGas.absdiff(one, five));
          });

          it('Max Uint256 - Max Uint256', async () => {
            await snapshotGasCost(bignum.estimateGas.absdiff(
              ethers.constants.MaxUint256.toHexString(),
              ethers.constants.MaxUint256.toHexString(),
            ));
          });
        });

        describe('modmul', async () => {
          it('5 % 2 * 3', async () => {
            const five = `0x${'00'.repeat(31)}05`;
            const two = `0x${'00'.repeat(31)}02`;
            const three = `0x${'00'.repeat(31)}03`;
            await snapshotGasCost(bignum.estimateGas.modmul(five, two, three));
          });

          it('Max Uint256 % 7 * Max Uint256', async () => {
            const seven = `0x${'00'.repeat(31)}07`;
            await snapshotGasCost(bignum.estimateGas.modmul(
              ethers.constants.MaxUint256.toHexString(),
              seven,
              ethers.constants.MaxUint256.toHexString(),
            ));
          });
        });

        describe('modexp', async () => {
          it('5 % 2 ** 3', async () => {
            const five = `0x${'00'.repeat(31)}05`;
            const two = `0x${'00'.repeat(31)}02`;
            const three = `0x${'00'.repeat(31)}03`;
            await snapshotGasCost(bignum.estimateGas.modexp(five, two, three));
          });

          it('Max Uint256 % 7 ** Max Uint256', async () => {
            const seven = `0x${'00'.repeat(31)}07`;
            await snapshotGasCost(bignum.estimateGas.modexp(
              ethers.constants.MaxUint256.toHexString(),
              seven,
              ethers.constants.MaxUint256.toHexString(),
            ));
          });
        });

        describe('cmp', async () => {
          it('5 cmp 2', async () => {
            const five = `0x${'00'.repeat(31)}05`;
            const two = `0x${'00'.repeat(31)}02`;
            await snapshotGasCost(bignum.estimateGas.cmp(five, two));
          });

          it('Max Uint256 cmp Max Uint256', async () => {
            await snapshotGasCost(bignum.estimateGas.cmp(
              ethers.constants.MaxUint256.toHexString(),
              ethers.constants.MaxUint256.toHexString(),
            ));
          });
        });
      });
    }
  });
});
