const { ethers } = require('hardhat');
const { expect } = require('chai');
const { deploy } = require('../utils/contracts');

describe('EcoBootstrap [@group=2]', () => {
  let bootstrap;
  let owner;
  const numPlaceholders = 20;

  beforeEach(async () => {
    [owner] = await ethers.getSigners();
    bootstrap = await deploy(
      'EcoBootstrap',
      await owner.getAddress(),
      numPlaceholders
    );
  });

  it('allocates 20 placeholder addresses', async () => {
    expect((await bootstrap.NUM_PLACEHOLDERS()).toString()).to.equal(
      numPlaceholders.toString()
    );
    const lastAddress = await bootstrap.placeholders(numPlaceholders - 1);
    expect(lastAddress.toString()).not.to.equal('0');
  });

  it('preserves ownership in the placeholder contracts', async () => {
    const placeholderAddress = await bootstrap.placeholders(15);
    const initializableProxy = await ethers.getContractAt(
      'EcoInitializable',
      placeholderAddress
    );

    expect(await initializableProxy.owner()).to.equal(await owner.getAddress());
  });
});
