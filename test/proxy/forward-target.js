const ForwardTarget = artifacts.require('ForwardTarget');
const ForwardProxy = artifacts.require('ForwardProxy');
const ImplementationUpdatingTarget = artifacts.require(
  'ImplementationUpdatingTarget',
);

const { expectRevert } = require('@openzeppelin/test-helpers');
const { isCoverage } = require('../../tools/test/coverage');

contract('ForwardTarget [@group=2]', () => {
  let proxy;
  let target;

  beforeEach(async () => {
    target = await ForwardTarget.new();
    proxy = await ForwardProxy.new(target.address);
  });

  it('cannot be reinitialized', async () => {
    const proxied = await ForwardTarget.at(proxy.address);

    await expectRevert(
      proxied.initialize(target.address),
      'only be called during initialization',
    );
  });

  it('initializes to the proper implementation address', async () => {
    const proxied = await ForwardTarget.at(proxy.address);

    assert.equal(
      await proxied.implementation(),
      await target.implementation(),
    );
  });

  it('does not allow updating to the same target address', async () => {
    const updatingTarget = await ImplementationUpdatingTarget.new();
    proxy = await ForwardProxy.new(updatingTarget.address);
    const proxiedUpdatingTarget = await ImplementationUpdatingTarget.at(
      proxy.address,
    );

    if (await isCoverage()) {
      return;
    }

    await expectRevert(
      proxiedUpdatingTarget.updateImplementation(
        await proxiedUpdatingTarget.implementation(),
      ),
      'Implementation already matching',
    );
  });

  it('does allow updating to a different target address', async () => {
    const updatingTarget = await ImplementationUpdatingTarget.new();
    const otherUpdatingTarget = await ImplementationUpdatingTarget.new();
    proxy = await ForwardProxy.new(updatingTarget.address);
    const proxiedUpdatingTarget = await ImplementationUpdatingTarget.at(
      proxy.address,
    );

    await proxiedUpdatingTarget.updateImplementation(
      otherUpdatingTarget.address,
    );
  });
});
