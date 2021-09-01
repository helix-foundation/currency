const ForwardProxy = artifacts.require('ForwardProxy');
const TestPolicy = artifacts.require('PolicyTestPolicy');
const PolicyInit = artifacts.require('PolicyInit');
const PolicyForAll = artifacts.require('PolicyForAll');
const DummyInflation = artifacts.require('DummyInflation');

const { expectRevert } = require('@openzeppelin/test-helpers');

const { singletons } = require('@openzeppelin/test-helpers');

contract('PolicyInit [@group=11]', () => {
  let proxy;
  let proxied;
  let policy;
  let policyInit;
  let registry;
  let allPolicy;

  beforeEach(async () => {
    policyInit = await PolicyInit.new();
    proxy = await ForwardProxy.new(policyInit.address);
    proxied = await PolicyInit.at(proxy.address);
    policy = await TestPolicy.new();
    registry = await singletons.ERC1820Registry();
    allPolicy = await PolicyForAll.new();
  });

  describe('initialize', () => {
    it('should not be callable', async () => {
      await expectRevert(
        proxied.initialize(policyInit.address),
        'Can only be called during initialization',
      );
    });
  });

  describe('fusedInit', () => {
    context('with mismatched key/value array lengths', () => {
      it('reverts', async () => {
        await expectRevert(
          proxied.fusedInit(policy.address, [], [], [policy.address], []),
          '_keys and _values must correspond exactly (length)',
        );
      });
    });

    context('with matching key/value array lengths', () => {
      it('allows empty array parameters', async () => {
        await proxied.fusedInit(policy.address, [], [], [], []);
      });

      it('sets the specified interface addresses in ERC1820', async () => {
        const interfaceName = web3.utils.soliditySha3('interface');

        await proxied.fusedInit(
          policy.address,
          [],
          [interfaceName],
          [allPolicy.address],
          [],
        );

        assert.equal(
          allPolicy.address,
          await registry.getInterfaceImplementer(
            proxied.address,
            interfaceName,
          ),
        );
      });

      it('duplicates the token resolver interfaces registrations', async () => {
        const tokenName = web3.utils.soliditySha3('ERC777Token');

        /* It doens't matter what contract is used here, just that it extends
         * PolicedUtils so that the `proxied` contract can set its interfaces.
         */
        const contractAllowingERC1820Management = await DummyInflation.new(
          proxy.address,
        );

        await proxied.fusedInit(
          policy.address,
          [],
          [tokenName],
          [contractAllowingERC1820Management.address],
          [tokenName],
        );

        assert.equal(
          contractAllowingERC1820Management.address,
          await registry.getInterfaceImplementer(
            contractAllowingERC1820Management.address,
            tokenName,
          ),
        );
      });
    });
  });
});
