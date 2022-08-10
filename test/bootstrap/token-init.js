const { ethers } = require('hardhat')
const { expect } = require('chai')
const { loadFixture } = require('ethereum-waffle')
const { singletonsFixture } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('TokenInit [@group=11]', () => {
  const fixture = async () => {
    await singletonsFixture((await ethers.getSigners())[0])
    const policy = await deploy('PolicyTestPolicy')

    const ecoInit = await deploy('EcoTokenInit')
    const ecoToken = await deploy('ECO', policy.address, ecoInit.address, 1000)
    const ecoProxy = await deploy('ForwardProxy', ecoToken.address)
    const ecoProxied = await ethers.getContractAt('ECO', ecoProxy.address)

    const ecoXInit = await deploy('EcoXTokenInit')
    const ecoXToken = await deploy(
      'ECOx',
      policy.address,
      ecoXInit.address,
      10,
      ecoProxy.address
    )
    const ecoXProxy = await deploy('ForwardProxy', ecoXToken.address)
    const ecoXProxied = await ethers.getContractAt('ECOx', ecoXProxy.address)

    return {
      ecoInit,
      ecoToken,
      ecoProxied,
      ecoXInit,
      ecoXToken,
      ecoXProxied,
    }
  }

  let ecoInit
  let ecoProxied
  let ecoToken

  let ecoXInit
  let ecoXProxied
  let ecoXToken

  const deadbeef = '0xdeadbeefbadf00dc0ffee1ceb00dafaceb00cec0'

  beforeEach(async () => {
    ;({ ecoInit, ecoToken, ecoProxied, ecoXInit, ecoXToken, ecoXProxied } =
      await loadFixture(fixture))
  })

  describe('initialize', () => {
    it('should not be callable', async () => {
      await expect(ecoProxied.initialize(ecoInit.address)).to.be.revertedWith(
        'Can only be called during initialization'
      )
      await expect(ecoXProxied.initialize(ecoXInit.address)).to.be.revertedWith(
        'Can only be called during initialization'
      )
    })
  })

  describe('distributeTokens', () => {
    describe('with mismatched array lengths', () => {
      it('reverts for eco', async () => {
        await expect(
          ecoInit.distributeTokens(ecoInit.address, [], [10])
        ).to.be.revertedWith(
          '_initialHolders and _initialBalances must correspond exactly (length)'
        )
      })
      it('reverts for ecox', async () => {
        await expect(
          ecoXInit.distributeTokens(ecoXInit.address, [deadbeef], [])
        ).to.be.revertedWith(
          '_initialHolders and _initialBalances must correspond exactly (length)'
        )
      })
    })

    describe('with matching key/value array lengths', () => {
      it('ecoinit allows empty array parameters', async () => {
        await ecoInit.distributeTokens(ecoToken.address, [], [])
      })

      it('ecoXinit allows empty array parameters', async () => {
        await ecoXInit.distributeTokens(ecoXToken.address, [], [])
      })

      it('ecoinit correctly funds the account', async () => {
        const mintAmount = '1000'
        await ecoInit.distributeTokens(
          ecoProxied.address,
          [deadbeef],
          [mintAmount]
        )

        const tokens = (await ecoProxied.balanceOf(deadbeef)).toString()
        expect(tokens).to.equal(mintAmount)
      })

      it('ecoXinit correctly funds the account', async () => {
        const mintAmount = '10'
        await ecoXInit.distributeTokens(
          ecoXProxied.address,
          [deadbeef],
          [mintAmount]
        )

        const tokens = (await ecoXProxied.balanceOf(deadbeef)).toString()
        expect(tokens).to.equal(mintAmount)
      })
    })
  })
})
