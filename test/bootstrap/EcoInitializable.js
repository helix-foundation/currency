const SampleForward = artifacts.require('SampleForward');
const ForwardProxy = artifacts.require('ForwardProxy');
const FailingInitializeContract = artifacts.require('FailingInitializeContract');
const EcoInitializable = artifacts.require('EcoInitializable');

const { expectRevert } = require('@openzeppelin/test-helpers');

contract('EcoInitializable [@group=2]', (accounts) => {
  it('fuses forward', async () => {
    const initializationContract = await EcoInitializable.new(accounts[1]);
    const proxy = await ForwardProxy.new(initializationContract.address);
    const initializableProxy = await EcoInitializable.at(proxy.address);

    const newTarget = await SampleForward.new();
    await initializableProxy.fuseImplementation(
      newTarget.address,
      { from: accounts[1] },
    );

    const proxiedTargetContract = await SampleForward.at(proxy.address);

    assert.deepEqual(
      await newTarget.value(),
      await proxiedTargetContract.value(),
    );
  });

  context('when called by the owner', async () => {
    const [, owner] = accounts;
    const meta = { from: owner };
    let initializableProxy;

    beforeEach(async () => {
      const initializationContract = await EcoInitializable.new(owner);
      const proxyContract = await ForwardProxy.new(
        initializationContract.address,
      );
      initializableProxy = await EcoInitializable.at(proxyContract.address);
    });

    it('should copy the owner', async () => {
      assert.equal(owner, await initializableProxy.owner());
    });

    it('should allow setting the implementation', async () => {
      const targetContract = await SampleForward.new();

      await initializableProxy.fuseImplementation(
        targetContract.address,
        meta,
      );

      assert.equal(
        await initializableProxy.implementation(),
        targetContract.address,
      );
    });

    it('should destruct', async () => {
      const initializableProxyAddress = initializableProxy.address;
      await initializableProxy.destruct(meta);

      assert.equal(await web3.eth.getCode(initializableProxyAddress), '0x');
    });

    context('and the new target fails to initialize', () => {
      let failingInitializeTarget;

      beforeEach(async () => {
        failingInitializeTarget = await FailingInitializeContract.new();
      });

      it('reverts', async () => {
        await expectRevert(
          initializableProxy.fuseImplementation(
            failingInitializeTarget.address,
            meta,
          ),
          'initialize call failed',
        );
      });
    });
  });

  context('when called by an other', async () => {
    const [, owner, other] = accounts;
    const meta = { from: other };
    let root;
    let initializableProxy;

    beforeEach(async () => {
      root = await EcoInitializable.new(owner);
      const proxyContract = await ForwardProxy.new(root.address);
      initializableProxy = await EcoInitializable.at(proxyContract.address);
    });

    it('should not allow setting the implementation', async () => {
      const targetContract = await SampleForward.new();
      await expectRevert(
        initializableProxy.fuseImplementation(
          targetContract.address,
          meta,
        ),
        'Only owner can change implementation',
      );
    });

    it('should not allow destructing', async () => {
      await expectRevert(
        initializableProxy.destruct(meta),
        'Only owner may clean up',
      );
    });

    context('to the root contract', () => {
      it('should not allow calling initialize', async () => {
        await expectRevert(
          root.initialize(root.address, meta),
          'Can only be called during initialization',
        );
      });
    });
  });
});
