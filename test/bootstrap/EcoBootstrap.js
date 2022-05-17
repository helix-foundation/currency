const { assert } = require('chai');

const EcoBootstrap = artifacts.require('EcoBootstrap');
const EcoInitializable = artifacts.require('EcoInitializable');

contract('EcoBootstrap [@group=2]', ([owner]) => {
  let bootstrap;
  const numPlaceholders = 20;

  beforeEach(async () => {
    bootstrap = await EcoBootstrap.new(owner, numPlaceholders);
  });

  it('allocates 20 placeholder addresses', async () => {
    assert((await bootstrap.NUM_PLACEHOLDERS()).toString() === numPlaceholders.toString());

    const lastAddress = await bootstrap.placeholders(numPlaceholders - 1);

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
});
