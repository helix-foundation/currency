/* eslint-disable no-await-in-loop */

const VDFVerifier = artifacts.require('VDFVerifier');
const chai = require('chai');
const bnChai = require('bn-chai');
const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers');

const { BN, toBN } = web3.utils;
const { expect } = chai;

const {
  prove, n, bnHex,
} = require('../../tools/vdf');

chai.use(bnChai(BN));

// eslint-disable-next-line no-unused-vars
function vdfTrace(m) {
//  console.log(m);
}

contract('VDFVerifier [@group=6]', ([account]) => {
  const t = 4;
  const xbn = toBN('169746944503327805396974258181262165209195894124543141625064913165013613381');
  const [ybn, Usqrt] = prove(xbn, t);

  let instanceVDFVerifier;

  beforeEach(async () => {
    instanceVDFVerifier = await VDFVerifier.new(account);
  });

  describe('BigNumbers', () => {
    it('Rejects malformed bigint bytes', async () => {
      await expectRevert(instanceVDFVerifier.start(bnHex(xbn), t, '0x0001', { gas: 6000000 }), 'High-byte must be set for non-256bit-aligned number');
    });

    it('Rejects malformed bigint words', async () => {
      const bigone = `0x${'00'.repeat(63)}01`;
      await expectRevert(instanceVDFVerifier.start(bnHex(xbn), t, bigone, { gas: 6000000 }), 'High-word must be set for 256bit-aligned numbers');
    });
  });

  describe('testing VDF contract', () => {
    it('Matches N in contract and testing', async () => {
      expect(n).to.eq.BN(toBN(await instanceVDFVerifier.N()));
    });

    it('Contract can be cloned', async () => {
      await instanceVDFVerifier.clone();
    });

    it('Computed solutions match expectations', async () => {
      const x = toBN(3);

      // We expect this to be 3, squared 2^t + 1 times
      const [y] = prove(x, 2);

      let s = x;
      for (let i = 0; i < (2 ** 2) + 1; i += 1) {
        s = s.mul(s);
      }

      expect(s).to.eq.BN(y);
    });

    context('When starting', () => {
      it('Does not allow Y larger than N', async () => {
        await expectRevert(instanceVDFVerifier.start(bnHex(xbn), t, bnHex(n), { gas: 6000000 }), 'y must be less than N');
      });

      it('Does not allow small Y', async () => {
        await expectRevert(instanceVDFVerifier.start(bnHex(xbn), t, bnHex(toBN(2)), { gas: 6000000 }), 'The secret (y) must be at least 512 bit long');
      });

      it.only('Does not allow Y between 32 and 64 bytes', async () => {
        await expectRevert(instanceVDFVerifier.start(bnHex(xbn), t, bnHex(toBN(2).pow(toBN(504)).subn(1)), { gas: 6000000 }), 'The secret (y) must be at least 512 bit long');
      });

      it('Does not allow X < 2', async () => {
        await expectRevert(instanceVDFVerifier.start(bnHex(toBN(1)), t, bnHex(n.subn(1)), { gas: 6000000 }), 'The commitment (x) must be > 1');
      });

      it('Does not allow t=0', async () => {
        await expectRevert(instanceVDFVerifier.start(bnHex(xbn), 0, bnHex(n.subn(1)), { gas: 6000000 }), 't must be at least 2');
      });

      it('Allows valid start parameters', async () => {
        await instanceVDFVerifier.start(bnHex(xbn), t, bnHex(n.subn(1)), { gas: 6000000 });
      });
    });

    context('without a valid start', () => {
      it('rejects updates', async () => {
        await expectRevert(instanceVDFVerifier.update(1, bnHex(toBN(2))), 'The request is inconsistent with the state');
      });
    });

    context('with a valid start', () => {
      beforeEach(async () => {
        await await instanceVDFVerifier.start(bnHex(xbn), t, bnHex(ybn), { gas: 6000000 });
      });

      it('Rejects out-of-order updates', async () => {
        await expectRevert(instanceVDFVerifier.update(2, bnHex(toBN(2))), 'The request is inconsistent with the state');
      });

      it('Requires U != 1', async () => {
        await expectRevert(instanceVDFVerifier.update(1, bnHex(toBN(1))), 'u must be greater than 1');
      });

      it('Requires U*U != 1', async () => {
        await expectRevert(instanceVDFVerifier.update(1, bnHex(n.subn(1))), 'u*u must be greater than 1');
      });

      it('Requires U<N', async () => {
        await expectRevert(instanceVDFVerifier.update(1, bnHex(n)), 'u must be less than N');
      });

      it('Allows updates with valid U', async () => {
        await instanceVDFVerifier.update(1, bnHex(ybn));
      });

      context('With a near-complete set of updates', () => {
        beforeEach(async () => {
          for (let i = 0; i < t - 2; i += 1) {
            await instanceVDFVerifier.update(i + 1, bnHex(Usqrt[i]));
          }
        });

        it('Rejects if last update is invalid', async () => {
          await expectRevert(instanceVDFVerifier.update(t - 1, bnHex(toBN(2))), 'Verification failed in the last step');
        });

        it('Accepts if the last update is valid', async () => {
          await instanceVDFVerifier.update(t - 1, bnHex(Usqrt[t - 2]));
        });

        context('With a completed proof', () => {
          let tx;
          beforeEach(async () => {
            tx = await instanceVDFVerifier.update(t - 1, bnHex(Usqrt[t - 2]));
          });

          it('Does not show verified for bogus numbers', async () => {
            expect(await instanceVDFVerifier.isVerified(3, t, bnHex(ybn))).to.be.false;
          });

          it('Shows verified for correct numbers', async () => {
            expect(await instanceVDFVerifier.isVerified(bnHex(xbn), t, bnHex(ybn))).to.be.true;
          });

          it('Emitted the Verified event', async () => {
            await expectEvent.inLogs(tx.logs, 'Verified', { t: '4', x: xbn, y: bnHex(ybn) });
          });
        });
      });
    });

    it(`full VDF compute with t=${t}`, async () => {
      // re-init with correct values
      let result = await instanceVDFVerifier.start(bnHex(xbn), t, bnHex(ybn), { gas: 6000000 });
      vdfTrace(`start: gas used ${result.receipt.gasUsed}`);

      let totalGasInVerify = result.receipt.gasUsed;

      vdfTrace(`\nx: ${bnHex(xbn)}`);
      vdfTrace(`y: ${bnHex(ybn)}`);
      vdfTrace(`n: ${bnHex(n)}`);

      let seenShorterU = false;

      for (let i = 0; i < t - 1; i += 1) {
        const u = Usqrt[i];
        vdfTrace(`u     ${i + 1}: ${bnHex(u)}`);

        if (!seenShorterU && u.bitLength() < n.bitLength()) {
          seenShorterU = true;
          vdfTrace(`Seen log2(u)=${u.bitLength()} < log2(n)=${n.bitLength()}`);
        }
        result = await instanceVDFVerifier.update(i + 1, bnHex(u));
        vdfTrace(`update: gas used ${result.receipt.gasUsed}`);
        totalGasInVerify += result.receipt.gasUsed;
      }

      vdfTrace(`update: total gas used ${totalGasInVerify} (<${Math.ceil(totalGasInVerify / 100000) / 10} Mln) T=2^${t}`);
      vdfTrace(`update: total gas cost @20 Gwei ${(20 * totalGasInVerify) / 1000000000} ETH`);

      expect(await instanceVDFVerifier.isVerified(bnHex(xbn), t, bnHex(ybn))).to.be.true;

      assert.equal(seenShorterU, true, 'Although not critical, we would like to see log2(u) < log(n), because we set u.bitlen = n.bitlen in the contract');
    });
  });
});
