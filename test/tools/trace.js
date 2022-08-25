const { ethers } = require('hardhat')

const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')
const util = require('../../tools/test/util')
const { ecoFixture } = require('../utils/fixtures')

describe('trace', () => {
  let trustedNodes

  let alice
  let bob

  beforeEach(async () => {
    ;[alice, bob] = await ethers.getSigners()
    const bobAddress = await bob.getAddress()
    const fixture = () => ecoFixture([bobAddress])
    ;({ trustedNodes } = await loadFixture(fixture))
  })

  it('traces reverting transactions', async () => {
    await expect(
      util.trace(trustedNodes.trust(await alice.getAddress()))
    ).to.be.revertedWith('Only the policy contract may call this method')
  })
})
