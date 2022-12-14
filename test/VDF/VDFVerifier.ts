/* eslint-disable no-await-in-loop */

import { ethers } from 'hardhat'
import { expect } from 'chai'
import { VDFVerifier } from '../../typechain-types'
import { ContractTransaction } from 'ethers'
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { deploy } from '../utils/contracts'
import { singletonsFixture } from '../utils/fixtures'
const BN = require('bn.js')
const { prove, n, bnHex } = require('../../tools/vdf')

// eslint-disable-next-line no-unused-vars
function vdfTrace(m: string) {
  // console.log(m);
}

describe('VDFVerifier [@group=6]', () => {
  const t = 10
  const xbn = new BN(
    '33489018563487178283330196417991470257782488426382532093764016677620128062547'
  )
  const [ybn, Usqrt] = prove(xbn, t)

  let instanceVDFVerifier: VDFVerifier

  before(async () => {
    await singletonsFixture((await ethers.getSigners())[0])
  })
  let account: SignerWithAddress
  beforeEach(async () => {
    ;[account] = await ethers.getSigners()
    instanceVDFVerifier = await deploy(
      'VDFVerifier',
      await account.getAddress()
    )
  })
  describe('BigNumbers', () => {
    it('Rejects malformed bigint words', async () => {
      const bigone = `0x${'00'.repeat(63)}01`
      await expect(
        instanceVDFVerifier.start(bnHex(xbn), t, bigone, { gasLimit: 6000000 })
      ).to.be.revertedWith(
        'High-word must be set when input is bytes32-aligned'
      )
    })
  })

  describe('testing VDF contract', () => {
    it('Matches N in contract and testing', async () => {
      expect(n).to.eq(new BN((await instanceVDFVerifier.N()).slice(2), 16))
    })

    it('Computed solutions match expectations', async () => {
      const x = new BN(3)

      // This is expected to be 3, squared 2^t + 1 times
      const [y] = prove(x, 2)

      let s = x
      for (let i = 0; i < 2 ** 2 + 1; i += 1) {
        s = s.mul(s)
      }

      expect(s).to.eq(y)
    })

    describe('When starting', () => {
      it('Does not allow Y larger than N', async () => {
        await expect(
          instanceVDFVerifier.start(bnHex(xbn), t, bnHex(n), {
            gasLimit: 6000000,
          })
        ).to.be.revertedWith('y must be less than N')
      })

      it('Does not allow small Y', async () => {
        await expect(
          instanceVDFVerifier.start(bnHex(xbn), t, bnHex(new BN(2)), {
            gasLimit: 6000000,
          })
        ).to.be.revertedWith('The secret (y) must be at least 64 bytes long')
      })

      it('Does not allow Y between 32 and 64 bytes', async () => {
        await expect(
          instanceVDFVerifier.start(
            bnHex(xbn),
            t,
            bnHex(new BN(2).pow(new BN(504)).subn(1)),
            {
              gasLimit: 6000000,
            }
          )
        ).to.be.revertedWith('The secret (y) must be at least 64 bytes long')
      })

      it('Does not allow X < 2', async () => {
        await expect(
          instanceVDFVerifier.start(bnHex(new BN(1)), t, bnHex(n.subn(1)), {
            gasLimit: 6000000,
          })
        ).to.be.revertedWith('The commitment (x) must be > 1')
      })

      it('Does not allow t=0', async () => {
        await expect(
          instanceVDFVerifier.start(bnHex(xbn), 0, bnHex(n.subn(1)), {
            gasLimit: 6000000,
          })
        ).to.be.revertedWith('t must be at least 2')
      })

      it('Allows valid start parameters', async () => {
        await instanceVDFVerifier.start(bnHex(xbn), t, bnHex(n.subn(1)), {
          gasLimit: 6000000,
        })
      })
    })

    describe('without a valid start', () => {
      it('rejects updates', async () => {
        await expect(
          instanceVDFVerifier.update(bnHex(new BN(2)))
        ).to.be.revertedWith('process has not yet been started')
      })
    })

    describe('with a valid start', () => {
      beforeEach(async () => {
        await instanceVDFVerifier.start(bnHex(xbn), t, bnHex(ybn), {
          gasLimit: 6000000,
        })
      })

      it('Requires U != 1', async () => {
        await expect(
          instanceVDFVerifier.update(bnHex(new BN(1)))
        ).to.be.revertedWith('u must be greater than 1')
      })

      it('Requires U*U != 1', async () => {
        await expect(
          instanceVDFVerifier.update(bnHex(n.subn(1)))
        ).to.be.revertedWith('u*u must be greater than 1')
      })

      it('Requires U<N', async () => {
        await expect(instanceVDFVerifier.update(bnHex(n))).to.be.revertedWith(
          'u must be less than N'
        )
      })

      it('Allows updates with valid U', async () => {
        await instanceVDFVerifier.update(bnHex(ybn))
      })

      describe('With a near-complete set of updates', () => {
        beforeEach(async () => {
          for (let i = 0; i < t - 2; i += 1) {
            await instanceVDFVerifier.update(bnHex(Usqrt[i]))
          }
        })

        it('Rejects if last update is invalid', async () => {
          await expect(
            instanceVDFVerifier.update(bnHex(new BN(2)))
          ).to.be.revertedWith('Verification failed in the last step')
        })

        it('Accepts if the last update is valid', async () => {
          await instanceVDFVerifier.update(bnHex(Usqrt[t - 2]))
        })

        describe('With a completed proof', () => {
          let tx: ContractTransaction
          beforeEach(async () => {
            tx = await instanceVDFVerifier.update(bnHex(Usqrt[t - 2]))
          })

          it('Does not show verified for bogus numbers', async () => {
            expect(await instanceVDFVerifier.isVerified(3, t, bnHex(ybn))).to.be
              .false
          })

          it('Shows verified for correct numbers', async () => {
            expect(
              await instanceVDFVerifier.isVerified(bnHex(xbn), t, bnHex(ybn))
            ).to.be.true
          })

          it('emits SuccessfulVerification', async () => {
            const receipt = await tx.wait()
            const log = receipt.events ? receipt.events[0] : undefined
            expect(log?.event).to.equal('SuccessfulVerification')
            expect(log?.args?.t).to.equal(t)
            expect(log?.args?.x).to.equal(bnHex(xbn))
            expect(log?.args?.y).to.equal(bnHex(ybn))
          })

          it('does not allow attempts to verify already verified pair', async () => {
            await expect(
              instanceVDFVerifier.start(bnHex(xbn), t, bnHex(ybn), {
                gasLimit: 6000000,
              })
            ).to.be.revertedWith(
              'this _x, _t combination has already been verified'
            )
          })
        })
      })
    })

    it(`full VDF compute with t=${t}`, async () => {
      // re-init with correct values
      let result = await instanceVDFVerifier.start(bnHex(xbn), t, bnHex(ybn), {
        gasLimit: 6000000,
      })
      let receipt = await result.wait()
      vdfTrace(`start: gas used ${receipt.gasUsed}`)

      let totalGasInVerify = Number(receipt.gasUsed)

      vdfTrace(`\nx: ${bnHex(xbn)}`)
      vdfTrace(`y: ${bnHex(ybn)}`)
      vdfTrace(`n: ${bnHex(n)}`)

      let seenShorterU = false

      for (let i = 0; i < t - 1; i += 1) {
        const u = Usqrt[i]
        vdfTrace(`u     ${i + 1}: ${bnHex(u)}`)

        if (!seenShorterU && u.bitLength() < n.bitLength()) {
          seenShorterU = true
          vdfTrace(`Seen log2(u)=${u.bitLength()} < log2(n)=${n.bitLength()}`)
        }
        result = await instanceVDFVerifier.update(bnHex(u))
        receipt = await result.wait()
        vdfTrace(`update: gas used ${receipt.gasUsed}`)
        totalGasInVerify += Number(receipt.gasUsed)
      }

      vdfTrace(
        `update: total gas used ${totalGasInVerify} (<${
          Math.ceil(totalGasInVerify / 100000) / 10
        } Mln) T=2^${t}`
      )
      vdfTrace(
        `update: total gas cost @20 Gwei ${
          (20 * totalGasInVerify) / 1000000000
        } ETH`
      )

      expect(await instanceVDFVerifier.isVerified(bnHex(xbn), t, bnHex(ybn))).to
        .be.true

      expect(seenShorterU).to.be.true
    })
  })
})
