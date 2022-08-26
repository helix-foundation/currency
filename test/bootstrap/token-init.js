const { ethers } = require('hardhat')

const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')
const { singletonsFixture } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('TokenInit [@group=11]', () => {
  const fixture = async () => {
    await singletonsFixture((await ethers.getSigners())[0])
    const policy = await deploy('PolicyTestPolicy')

    const tokenInit = await deploy('TokenInit')
    const ecoToken = await deploy(
      'ECO',
      policy.address,
      tokenInit.address,
      1000
    )
    const ecoProxy = await deploy('ForwardProxy', ecoToken.address)
    const ecoProxied = await ethers.getContractAt('ECO', ecoProxy.address)

    const ecoXToken = await deploy(
      'ECOx',
      policy.address,
      tokenInit.address,
      10,
      ecoProxy.address
    )
    const ecoXProxy = await deploy('ForwardProxy', ecoXToken.address)
    const ecoXProxied = await ethers.getContractAt('ECOx', ecoXProxy.address)

    return {
      tokenInit,
      ecoToken,
      ecoProxied,
      ecoXToken,
      ecoXProxied,
    }
  }

  let tokenInit
  let ecoProxied

  let ecoXProxied

  const deadbeef = '0xdeadbeefbadf00dc0ffee1ceb00dafaceb00cec0'

  beforeEach(async () => {
    ;({ tokenInit, ecoProxied, ecoXProxied } = await loadFixture(fixture))
  })

  describe('initialize', () => {
    it('should not be callable', async () => {
      await expect(ecoProxied.initialize(tokenInit.address)).to.be.revertedWith(
        'Can only be called during initialization'
      )
      await expect(
        ecoXProxied.initialize(tokenInit.address)
      ).to.be.revertedWith('Can only be called during initialization')
    })
  })

  describe('distributeTokens', () => {
    it('correctly funds the account with eco', async () => {
      const mintAmount = ethers.BigNumber.from(1000)
      await tokenInit.distributeTokens(ecoProxied.address, [
        {
          holder: deadbeef,
          balance: mintAmount,
        },
      ])

      const tokens = await ecoProxied.balanceOf(deadbeef)
      expect(tokens).to.equal(mintAmount)
    })

    it('correctly funds the account with ecox', async () => {
      const mintAmount = ethers.BigNumber.from(10)
      await tokenInit.distributeTokens(ecoXProxied.address, [
        {
          holder: deadbeef,
          balance: mintAmount,
        },
      ])

      const tokens = await ecoXProxied.balanceOf(deadbeef)
      expect(tokens).to.equal(mintAmount)
    })
  })
})
