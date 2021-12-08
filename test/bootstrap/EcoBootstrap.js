const EcoBootstrap = artifacts.require('EcoBootstrap');
const EcoInitializable = artifacts.require('EcoInitializable');

contract('EcoBootstrap [@group=2]', ([owner]) => {
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
});
