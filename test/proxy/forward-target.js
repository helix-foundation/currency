const { ethers } = require('hardhat')
const { expect } = require('chai')
const { deploy } = require('../utils/contracts')

describe('ForwardTarget [@group=2]', () => {
  let proxy
  let target

  beforeEach(async () => {
    target = await deploy('ForwardTargetImpl')
    proxy = await deploy('ForwardProxy', target.address)
  })

  it('cannot be reinitialized', async () => {
    const proxied = await ethers.getContractAt('ForwardTarget', proxy.address)

    await expect(proxied.initialize(target.address)).to.be.revertedWith(
      'Can only be called during initialization'
    )
  })

  it('initializes to the proper implementation address', async () => {
    const proxied = await ethers.getContractAt('ForwardTarget', proxy.address)

    assert.equal(await proxied.implementation(), await target.implementation())
  })

  it('does not allow updating to the same target address [ @skip-on-coverage ]', async () => {
    const updatingTarget = await deploy('ImplementationUpdatingTarget')
    proxy = await deploy('ForwardProxy', updatingTarget.address)
    const proxiedUpdatingTarget = await ethers.getContractAt(
      'ImplementationUpdatingTarget',
      proxy.address
    )

    await expect(
      proxiedUpdatingTarget.updateImplementation(
        await proxiedUpdatingTarget.implementation()
      )
    ).to.be.revertedWith('Implementation already matching')
  })

  it('does allow updating to a different target address', async () => {
    const updatingTarget = await deploy('ImplementationUpdatingTarget')
    const otherUpdatingTarget = await deploy('ImplementationUpdatingTarget')
    proxy = await deploy('ForwardProxy', updatingTarget.address)
    const proxiedUpdatingTarget = await ethers.getContractAt(
      'ImplementationUpdatingTarget',
      proxy.address
    )

    await proxiedUpdatingTarget.updateImplementation(
      otherUpdatingTarget.address
    )
  })
})
