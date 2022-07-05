const { ethers } = require('hardhat');
const { assert, expect } = require('chai');
const { deploy, deployProxy } = require('../utils/contracts');

describe('EcoInitializable [@group=5]', () => {
  let accounts = [];

  before(async () => {
    accounts = await ethers.getSigners();
  });

  it('fuses forward', async () => {
    const ecoInitializable = await deploy('EcoInitializable', await accounts[1].getAddress());
    const proxy = await deploy('ForwardProxy', ecoInitializable.address);
    const initializableProxy = await ethers.getContractAt('EcoInitializable', proxy.address);

    const newTarget = await deploy('SampleForward');
    await initializableProxy.connect(accounts[1]).fuseImplementation(newTarget.address);

    const proxiedTargetContract = await ethers.getContractAt('SampleForward', proxy.address);

    assert.deepEqual(await newTarget.value(), await proxiedTargetContract.value());
  });

  describe('when called by the owner', async () => {
    let initializableProxy;
    let owner;

    beforeEach(async () => {
      owner = accounts[1];

      initializableProxy = await deployProxy('EcoInitializable', await owner.getAddress());
    });

    it('should copy the owner', async () => {
      assert.equal(await owner.getAddress(), await initializableProxy.owner());
    });

    it('should allow setting the implementation', async () => {
      const targetContract = await (await ethers.getContractFactory('SampleForward')).deploy();

      await initializableProxy.connect(owner).fuseImplementation(targetContract.address);

      assert.equal(await initializableProxy.implementation(), targetContract.address);
    });

    describe('and the new target fails to initialize', () => {
      let failingInitializeTarget;

      beforeEach(async () => {
        failingInitializeTarget = await (
          await ethers.getContractFactory('FailingInitializeContract')
        ).deploy();
      });

      it('reverts', async () => {
        await expect(
          initializableProxy.connect(owner).fuseImplementation(failingInitializeTarget.address),
        ).to.be.revertedWith('initialize call failed');
      });
    });
  });

  describe('when called by an other', async () => {
    let root;
    let initializableProxy;
    let owner;
    let other;

    beforeEach(async () => {
      [, owner, other] = accounts;
      root = await deploy('EcoInitializable', await owner.getAddress());
      const proxyContract = await deploy('ForwardProxy', root.address);
      initializableProxy = await ethers.getContractAt('EcoInitializable', proxyContract.address);
    });

    it('should not allow setting the implementation', async () => {
      const targetContract = await deploy('SampleForward');
      await expect(
        initializableProxy.connect(other).fuseImplementation(targetContract.address),
      ).to.be.revertedWith('Only owner can change implementation');
    });

    describe('to the root contract', () => {
      it('should not allow calling initialize', async () => {
        await expect(root.connect(other).initialize(root.address)).to.be.revertedWith(
          'Can only be called during initialization',
        );
      });
    });
  });
});
