const { expect } = require('chai')
const { singletonsFixture } = require('./utils/fixtures')

describe('deploys singletons', async () => {
  let singleton1820

  beforeEach(async () => {
    const signers = await ethers.getSigners()
    singleton1820 = await singletonsFixture(signers[0])
  })

  it('exists', async () => {
    expect(await singleton1820.interfaceHash('test')).to.equal(
      ethers.utils.solidityKeccak256(['string'], ['test'])
    )
  })
})
