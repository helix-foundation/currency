const ForwardProxy = artifacts.require('ForwardProxy');
const TestPolicy = artifacts.require('PolicyTestPolicy');
const PolicyInit = artifacts.require('PolicyInit');
const PolicyForAll = artifacts.require('PolicyForAll');

const { expectRevert } = require('@openzeppelin/test-helpers');

const { singletons } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

contract('PolicyInit [@group=11]', (accounts) => {
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
    context('when called by an outsider address', () => {
      it('reverts', async () => {
        await expectRevert(
          proxied.fusedInit(policy.address, [], [], [], { from: accounts[1] }),
          'Ownable: caller is not the owner',
        );
      });
    });

    context('with mismatched key/value array lengths', () => {
      it('reverts', async () => {
        await expectRevert(
          proxied.fusedInit(policy.address, [], [], [policy.address]),
          '_keys and _values must correspond exactly (length)',
        );
      });
    });

    context('with matching key/value array lengths', () => {
      it('allows empty array parameters', async () => {
        await proxied.fusedInit(policy.address, [], [], []);
      });

      it('sets the specified interface addresses in ERC1820', async () => {
        const interfaceName = web3.utils.soliditySha3('interface');

        await proxied.fusedInit(
          policy.address,
          [],
          [interfaceName],
          [allPolicy.address],
        );

        expect(allPolicy.address).to.equal(
          await registry.getInterfaceImplementer(
            proxied.address,
            interfaceName,
          ),
        );
      });

      it('calling twice fails because proxy is changed', async () => {
        const interfaceName = web3.utils.soliditySha3('interface');

        await proxied.fusedInit(
          policy.address,
          [allPolicy.address],
          [interfaceName],
          [allPolicy.address],
        );

        const allPolicy2 = await PolicyForAll.new();
        await expectRevert.unspecified(proxied.fusedInit(
          policy.address,
          [allPolicy2.address],
          [interfaceName],
          [allPolicy2.address],
        ));

        const reproxied = await TestPolicy.at(proxied.address);
        const setter = await reproxied.setters(0);
        expect(setter).to.equal((`${allPolicy.address}000000000000000000000000`).toLowerCase());
      });

      it('using two policyInits on the same policy creates two independent proxies', async () => {
        const interfaceName1 = web3.utils.soliditySha3('interface1');
        const interfaceName2 = web3.utils.soliditySha3('interface2');

        await proxied.fusedInit(
          policy.address,
          [allPolicy.address],
          [interfaceName1],
          [allPolicy.address],
        );

        expect(allPolicy.address).to.equal(
          await registry.getInterfaceImplementer(
            proxied.address,
            interfaceName1,
          ),
        );

        const policyInit2 = await PolicyInit.new();
        const proxy2 = await ForwardProxy.new(policyInit2.address);
        const proxied2 = await PolicyInit.at(proxy2.address);
        const allPolicy2 = await PolicyForAll.new();

        await proxied2.fusedInit(
          policy.address,
          [allPolicy2.address],
          [interfaceName1, interfaceName2],
          [allPolicy.address, allPolicy2.address],
        );

        expect(allPolicy2.address).to.equal(
          await registry.getInterfaceImplementer(
            proxied2.address,
            interfaceName2,
          ),
        );

        const reproxied1 = await TestPolicy.at(proxied.address);
        const reproxied2 = await TestPolicy.at(proxied2.address);

        const name1address = await registry.getInterfaceImplementer(
          reproxied1.address,
          interfaceName1,
        );

        expect(name1address).to.equal(allPolicy.address);

        const name2address = await registry.getInterfaceImplementer(
          reproxied2.address,
          interfaceName2,
        );

        expect(name2address).to.equal(allPolicy2.address);

        const setter1 = await reproxied1.setters(0);
        expect(setter1).to.equal((`${allPolicy.address}000000000000000000000000`).toLowerCase());
        const setter2 = await reproxied2.setters(0);
        expect(setter2).to.equal((`${allPolicy2.address}000000000000000000000000`).toLowerCase());
      });
    });
  });
});
