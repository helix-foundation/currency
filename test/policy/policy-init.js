const { ethers } = require('hardhat');
const { expect } = require('chai');
const { deploy } = require('../utils/contracts');
const { singletonsFixture } = require('../utils/fixtures');

describe('PolicyInit [@group=11]', () => {
  const fixture = async () => {
    const accounts = await ethers.getSigners();
    const registry = await singletonsFixture(accounts[0]);
    const policyInit = await deploy('PolicyInit');
    const proxy = await deploy('ForwardProxy', policyInit.address);
    const proxied = await ethers.getContractAt('PolicyInit', proxy.address);
    const policy = await deploy('TestPolicy');
    const allPolicy = await deploy('PolicyForAll');
    return {
      accounts,
      policyInit,
      proxied,
      policy,
      registry,
      allPolicy,
    };
  };

  let proxied;
  let policy;
  let policyInit;
  let registry;
  let allPolicy;
  let accounts;

  beforeEach(async () => {
    ({
      accounts, policyInit, proxied, policy, registry, allPolicy,
    } = await fixture());
  });

  describe('initialize', () => {
    it('should not be callable', async () => {
      await expect(proxied.initialize(policyInit.address)).to.be.revertedWith(
        'Can only be called during initialization',
      );
    });
  });

  describe('fusedInit', () => {
    context('when called by an outsider address', () => {
      it('reverts', async () => {
        await expect(
          proxied.connect(accounts[1]).fusedInit(policy.address, [], [], []),
        ).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });

    context('with mismatched key/value array lengths', () => {
      it('reverts', async () => {
        await expect(
          proxied.fusedInit(policy.address, [], [], [policy.address]),
        ).to.be.revertedWith('_keys and _values must correspond exactly (length)');
      });
    });

    context('with matching key/value array lengths', () => {
      it('allows empty array parameters', async () => {
        await proxied.fusedInit(policy.address, [], [], []);
      });

      it('sets the specified interface addresses in ERC1820', async () => {
        const interfaceName = ethers.utils.solidityKeccak256(['string'], ['interface']);

        await proxied.fusedInit(policy.address, [], [interfaceName], [allPolicy.address]);

        expect(allPolicy.address).to.equal(
          await registry.getInterfaceImplementer(proxied.address, interfaceName),
        );
      });

      it('calling twice fails because proxy is changed', async () => {
        const interfaceName = ethers.utils.solidityKeccak256(['string'], ['interface']);

        await proxied.fusedInit(
          policy.address,
          [allPolicy.address + '00'.repeat(12)],
          [interfaceName],
          [allPolicy.address],
        );

        const allPolicy2 = await deploy('PolicyForAll');
        await expect(
          proxied.fusedInit(
            policy.address,
            [allPolicy2.address + '00'.repeat(12)],
            [interfaceName],
            [allPolicy2.address],
          ),
        ).to.be.reverted;

        const reproxied = await ethers.getContractAt('TestPolicy', proxied.address);
        const setter = await reproxied.setters(0);
        expect(setter).to.equal(`${allPolicy.address}000000000000000000000000`.toLowerCase());
      });

      it('using two policyInits on the same policy creates two independent proxies', async () => {
        const interfaceName1 = ethers.utils.solidityKeccak256(['string'], ['interface1']);
        const interfaceName2 = ethers.utils.solidityKeccak256(['string'], ['interface2']);

        await proxied.fusedInit(
          policy.address,
          [allPolicy.address + '00'.repeat(12)],
          [interfaceName1],
          [allPolicy.address],
        );

        expect(allPolicy.address).to.equal(
          await registry.getInterfaceImplementer(proxied.address, interfaceName1),
        );

        const policyInit2 = await deploy('PolicyInit');
        const proxy2 = await deploy('ForwardProxy', policyInit2.address);
        const proxied2 = await ethers.getContractAt('PolicyInit', proxy2.address);
        const allPolicy2 = await deploy('PolicyForAll');

        await proxied2.fusedInit(
          policy.address,
          [allPolicy2.address + '00'.repeat(12)],
          [interfaceName1, interfaceName2],
          [allPolicy.address, allPolicy2.address],
        );

        expect(allPolicy2.address).to.equal(
          await registry.getInterfaceImplementer(proxied2.address, interfaceName2),
        );

        const reproxied1 = await ethers.getContractAt('TestPolicy', proxied.address);
        const reproxied2 = await ethers.getContractAt('TestPolicy', proxied2.address);

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
        expect(setter1).to.equal(`${allPolicy.address}000000000000000000000000`.toLowerCase());
        const setter2 = await reproxied2.setters(0);
        expect(setter2).to.equal(`${allPolicy2.address}000000000000000000000000`.toLowerCase());
      });
    });
  });
});
