const EcoBootstrap = artifacts.require('EcoBootstrap');
const EcoInitializable = artifacts.require('EcoInitializable');

const { expectRevert } = require('@openzeppelin/test-helpers');

contract('EcoBootstrap [@group=2]', ([owner, other]) => {
  let bootstrap;

  beforeEach(async () => {
    bootstrap = await EcoBootstrap.new(owner);
  });

  it('allocates 20 placeholder addresses', async () => {
    const lastAddress = await bootstrap.placeholders(19);

    assert(lastAddress.toString() !== '0');
  });

  it('preserves ownership in the placeholder contracts', async () => {
    const placeholderAddress = await bootstrap.placeholders(15);
    const initializableProxy = await EcoInitializable.at(placeholderAddress);

    assert.equal(
      await initializableProxy.owner(),
      owner,
    );
  });

  context('by the owner', () => {
    const meta = { from: owner };

    it('can be destructed', async () => {
      const bootstrapAddress = bootstrap.address;
      await bootstrap.destruct(meta);

      assert.equal(await web3.eth.getCode(bootstrapAddress), '0x');
    });
  });

  context('by a non-owner', () => {
    const meta = { from: other };

    it('cannot be destructed', async () => {
      await expectRevert(bootstrap.destruct(meta), 'caller is not the owner');
    });
  });
});
