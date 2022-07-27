const { expect } = require('chai');
const { ethers } = require('hardhat');
const { singletons } = require('@openzeppelin/test-helpers');
const { deploySingletons } = require('./utils/fixtures');

describe('deploys singletons', async () => {
  before(async () => {
    const signers = await ethers.getSigners();
    await deploySingletons(signers[0]);
  });

  it('exists', async () => {
    const singleton = await singletons.ERC1820Registry(
      '0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24'
    );
    expect(await singleton.interfaceHash('test')).to.equal(
      ethers.utils.solidityKeccak256(['string'], ['test'])
    );
  });
});
