const { ethers } = require('hardhat')

const Nick = require('../../tools/nicks')

describe("Nick's method [@group=2]", async () => {
  let accounts

  before(async () => {
    accounts = await ethers.getSigners()
  })

  it('deploys', async () => {
    const numPlaceholders = 20
    const abiCoder = new ethers.utils.AbiCoder()
    const ecoBootstrap = await ethers.getContractFactory('EcoBootstrap')
    const nick = Nick.decorateTx(
      Nick.generateTx(
        ecoBootstrap.bytecode,
        `0x${Buffer.from(ethers.utils.randomBytes(16)).toString('hex')}`,
        5000000,
        100000000000,
        abiCoder.encode(
          ['address', 'uint8'],
          [await accounts[2].getAddress(), numPlaceholders]
        )
      )
    )

    expect((await ethers.provider.getCode(nick.to)).length).to.be.lessThan(10)

    await accounts[0].sendTransaction({
      to: nick.from,
      value: '500000000000000000',
    })
    await ethers.provider.sendTransaction(nick.raw)

    const normalInstance = await ecoBootstrap.deploy(
      await accounts[2].getAddress(),
      numPlaceholders
    )
    expect(await ethers.provider.getCode(normalInstance.address)).to.equal(
      await ethers.provider.getCode(nick.to)
    )

    expect(
      await (
        await ethers.getContractAt('EcoBootstrap', nick.to)
      ).NUM_PLACEHOLDERS()
    ).to.equal(numPlaceholders)
  })
})
