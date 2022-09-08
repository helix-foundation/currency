const { expect } = require('chai')

const { deploy } = require('../utils/contracts')
const { ZERO_ADDR } = require('../utils/fixtures')

describe('EcoBootstrap [@group=2]', () => {
  let bootstrap
  let owner
  const numPlaceholders = ethers.BigNumber.from(20)

  beforeEach(async () => {
    ;[owner] = await ethers.getSigners()
    bootstrap = await deploy(
      'EcoBootstrap',
      await owner.getAddress(),
      numPlaceholders
    )
  })

  it('allocates 20 placeholder addresses', async () => {
    expect(await bootstrap.NUM_PLACEHOLDERS()).to.equal(numPlaceholders)
    const lastAddress = await bootstrap.placeholders(numPlaceholders.sub(1))
    expect(lastAddress).to.not.equal(ethers.constants.AddressZero)
  })

  it('preserves ownership in the placeholder contracts', async () => {
    const placeholderAddress = await bootstrap.placeholders(15)
    const initializableProxy = await ethers.getContractAt(
      'EcoInitializable',
      placeholderAddress
    )

    expect(await initializableProxy.owner()).to.equal(await owner.getAddress())
  })
})
