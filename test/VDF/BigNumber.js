/* eslint-disable no-await-in-loop */

const BigNum = artifacts.require('BigNum');
const chai = require('chai');
const bnChai = require('bn-chai');
const { expectRevert } = require('@openzeppelin/test-helpers');
// const { isCoverage } = require('../../tools/test/coverage');

const { BN, toBN } = web3.utils;
const { expect } = chai;

chai.use(bnChai(BN));

contract('BigNumber [@group=3]', () => {
  let bignum;

  beforeEach(async () => {
    bignum = await BigNum.new();
  });

  describe('Input', () => {
    it('Rejects malformed bigint bytes', async () => {
      await expectRevert(bignum.fromBytes('0x0001'), 'High-byte must be set for non-256bit-aligned number');
    });

    it('Rejects malformed bigint words', async () => {
      const bigone = `0x${'00'.repeat(63)}01`;
      await expectRevert(bignum.fromBytes(bigone), 'High-word must be set for 256bit-aligned numbers');
    });

    it('Matches 1', async () => {
      assert.equal(await bignum.fromUint(1), '0x01');
    });

    it('Matches uint 0', async () => {
      assert.equal(await bignum.fromUint(0), null);
    });

    it('Matches byte 0', async () => {
      assert.equal(await bignum.fromBytes('0x'), null);
    });
  });

  describe('Math', () => {
    const n = 'ff'.repeat(32);
    const z = '00'.repeat(32);
    const p = `${'00'.repeat(31)}01`;

    describe('Simple ops', () => {
      const list = ['0x', `0x${n}`, `0x${p}`, `0x${n}${n}`, `0x${n}${z}`, `0x${n}${p}`, `0x${p}${n}`, `0x${p}${z}`, `0x${p}${p}`];
      list.forEach((a) => {
        list.forEach((b) => {
          it(`${a} + ${b}`, async () => {
            const r = await bignum.add(a, b);
            const e = toBN(a).add(toBN(b));
            if (e.eqn(0)) {
              expect(r).to.be.null;
            } else {
              expect(toBN(r)).to.eq.BN(e);
            }
          });

          it(`abs(${a} - ${b})`, async () => {
            const r = await bignum.absdiff(a, b);
            const e = toBN(a).sub(toBN(b)).abs();
            if (e.eqn(0)) {
              expect(r).to.be.null;
            } else {
              expect(toBN(r)).to.eq.BN(e);
            }
          });

          it(`${a} <=> ${b}`, async () => {
            const r = await bignum.cmp(a, b);
            const e = toBN(a).cmp(toBN(b));
            expect(r).to.eq.BN(e);
          });
        });
      });
    });

    describe('Multiplicative', () => {
      const list = [`0x${n}`, `0x${p}`, `0x${n}${n}`, `0x${n}${z}`, `0x${n}${p}`, `0x${p}${n}`, `0x${p}${z}`, `0x${p}${p}`];
      const modulos = [`0x${n}`, `0x${n}${n}`, `0x${n}${z}`, `0x${n}${p}`, `0x${p}${n}`, `0x${p}${z}`, `0x${p}${p}`, `0x${'ff'.repeat(256)}`];
      list.forEach((a) => {
        list.forEach((b) => {
          modulos.forEach((c) => {
            it(`${a} * ${b} % ${c}`, async () => {
              const r = await bignum.modmul(a, b, c);
              const e = toBN(a).mul(toBN(b)).mod(toBN(c));
              if (e.eqn(0)) {
                expect(r).to.be.null;
              } else {
                expect(toBN(r)).to.eq.BN(e);
              }
            });

            it(`${a} ** ${b} % ${c}`, async () => {
              const r = await bignum.modexp(a, b, c);
              const red = BN.red(toBN(c));
              const e = toBN(a).toRed(red).redPow(toBN(b)).fromRed();
              if (e.eqn(0)) {
                expect(r).to.be.null;
              } else {
                expect(toBN(r)).to.eq.BN(e);
              }
            });
          });
        });
      });
    });
  });
});
