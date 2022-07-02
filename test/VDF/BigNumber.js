/* eslint-disable no-await-in-loop */

const { assert, expect } = require('chai');

const BN = require('bn.js');
const web3 = require('web3');
const { deploy } = require('../utils/contracts');

const { toBN } = web3.utils;

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
          it(`${a} + ${b}`, async () => {
            const r = await bignum.add(a, b);
            const e = toBN(a).add(toBN(b));
            if (e.eqn(0)) {
              expect(r).to.equal('0x');
            } else {
              expect(toBN(r).eq(e)).to.be.true;
            }
          });

          it(`abs(${a} - ${b})`, async () => {
            const r = await bignum.absdiff(a, b);
            const e = toBN(a).sub(toBN(b)).abs();
            if (e.eqn(0)) {
              expect(r).to.equal('0x');
            } else {
              expect(toBN(r).eq(e)).to.be.true;
            }
          });

          it(`${a} <=> ${b}`, async () => {
            const r = await bignum.cmp(a, b);
            const e = toBN(a).cmp(toBN(b));
            expect(r.eq(e)).to.be.true;
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
              const r = await bignum.modmul(a, b, c);
              const e = toBN(a).mul(toBN(b)).mod(toBN(c));
              if (e.eqn(0)) {
                expect(r).to.equal('0x');
              } else {
                expect(toBN(r).eq(e)).to.be.true;
              }
            });

            it(`${a} ** ${b} % ${c}`, async () => {
              const r = await bignum.modexp(a, b, c);
              const red = BN.red(toBN(c));
              const e = toBN(a).toRed(red).redPow(toBN(b)).fromRed();
              if (e.eqn(0)) {
                expect(r).to.equal('0x');
              } else {
                expect(toBN(r).eq(e)).to.be.true;
              }
            });
          });
        });
      });
    });

    describe('gas [ @skip-on-coverage ]', () => {
      describe('fromBytes', async () => {
        it('0x', async () => {
          await snapshotGasCost(bignum.fromBytes.estimateGas('0x'));
        });

        it('0x1234', async () => {
          await snapshotGasCost(bignum.fromBytes.estimateGas('0x1234'));
        });

        it('Max Uint256', async () => {
          await snapshotGasCost(
            bignum.fromBytes.estimateGas(ethers.constants.MaxUint256.toHexString()),
          );
        });
      });

      describe('fromUint', async () => {
        it('0', async () => {
          await snapshotGasCost(bignum.fromUint.estimateGas(0));
        });

        it('1234', async () => {
          await snapshotGasCost(bignum.fromUint.estimateGas(1234));
        });

        it('Max Uint256', async () => {
          await snapshotGasCost(bignum.fromUint.estimateGas(ethers.constants.MaxUint256));
        });
      });

      describe('add', async () => {
        it('1 + 5', async () => {
          const one = `0x${'00'.repeat(31)}01`;
          const five = `0x${'00'.repeat(31)}05`;
          await snapshotGasCost(bignum.add.estimateGas(one, five));
        });

        it('Max Uint256 + Max Uint256', async () => {
          await snapshotGasCost(bignum.add.estimateGas(
            ethers.constants.MaxUint256.toHexString(),
            ethers.constants.MaxUint256.toHexString(),
          ));
        });
      });

      describe('absdiff', async () => {
        it('1 - 5', async () => {
          const one = `0x${'00'.repeat(31)}01`;
          const five = `0x${'00'.repeat(31)}05`;
          await snapshotGasCost(bignum.absdiff.estimateGas(one, five));
        });

        it('Max Uint256 - Max Uint256', async () => {
          await snapshotGasCost(bignum.absdiff.estimateGas(
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
          await snapshotGasCost(bignum.modmul.estimateGas(five, two, three));
        });

        it('Max Uint256 % 7 * Max Uint256', async () => {
          const seven = `0x${'00'.repeat(31)}07`;
          await snapshotGasCost(bignum.modmul.estimateGas(
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
          await snapshotGasCost(bignum.modexp.estimateGas(five, two, three));
        });

        it('Max Uint256 % 7 ** Max Uint256', async () => {
          const seven = `0x${'00'.repeat(31)}07`;
          await snapshotGasCost(bignum.modexp.estimateGas(
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
          await snapshotGasCost(bignum.cmp.estimateGas(five, two));
        });

        it('Max Uint256 cmp Max Uint256', async () => {
          await snapshotGasCost(bignum.cmp.estimateGas(
            ethers.constants.MaxUint256.toHexString(),
            ethers.constants.MaxUint256.toHexString(),
          ));
        });
      });
    });
  });
});
