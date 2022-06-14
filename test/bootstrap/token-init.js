const ForwardProxy = artifacts.require('ForwardProxy');
const TestPolicy = artifacts.require('PolicyTestPolicy');
const ECO = artifacts.require('ECO');
const EcoTokenInit = artifacts.require('EcoTokenInit');
const ECOx = artifacts.require('ECOx');
const EcoXTokenInit = artifacts.require('EcoXTokenInit');

const { expectRevert } = require('@openzeppelin/test-helpers');

const { expect } = require('chai');

contract('TokenInit [@group=11]', () => {
  let ecoInit;
  let ecoProxy;
  let ecoProxied;
  let ecoToken;

  let ecoXInit;
  let ecoXProxy;
  let ecoXProxied;
  let ecoXToken;

  let policy;

  const deadbeef = '0xdeadbeefbadf00dc0ffee1ceb00dafaceb00cec0';

  beforeEach(async () => {
    policy = await TestPolicy.new();

    ecoInit = await EcoTokenInit.new();
    ecoToken = await ECO.new(policy.address, ecoInit.address, 1000);
    ecoProxy = await ForwardProxy.new(ecoToken.address);
    ecoProxied = await ECO.at(ecoProxy.address);

    ecoXInit = await EcoXTokenInit.new();
    ecoXToken = await ECOx.new(policy.address, ecoXInit.address, 10, ecoProxy.address);
    ecoXProxy = await ForwardProxy.new(ecoXToken.address);
    ecoXProxied = await ECOx.at(ecoXProxy.address);
  });

  describe('initialize', () => {
    it('should not be callable', async () => {
      await expectRevert(
        ecoProxied.initialize(ecoInit.address),
        'Can only be called during initialization',
      );
      await expectRevert(
        ecoXProxied.initialize(ecoXInit.address),
        'Can only be called during initialization',
      );
    });
  });

  describe('distributeTokens', () => {
    context('with mismatched array lengths', () => {
      it('reverts for eco', async () => {
        await expectRevert(
          ecoInit.distributeTokens(ecoInit.address, [], [10]),
          '_initialHolders and _initialBalances must correspond exactly (length)',
        );
      });
      it('reverts for ecox', async () => {
        await expectRevert(
          ecoXInit.distributeTokens(ecoXInit.address, [deadbeef], []),
          '_initialHolders and _initialBalances must correspond exactly (length)',
        );
      });
    });

    context('with matching key/value array lengths', () => {
      it('ecoinit allows empty array parameters', async () => {
        await ecoInit.distributeTokens(ecoToken.address, [], []);
      });

      it('ecoXinit allows empty array parameters', async () => {
        await ecoXInit.distributeTokens(ecoXToken.address, [], []);
      });

      it('ecoinit correctly funds the account', async () => {
        const mintAmount = '1000';
        await ecoInit.distributeTokens(
          ecoProxied.address,
          [deadbeef],
          [mintAmount],
        );

        const tokens = (await ecoProxied.balanceOf(deadbeef)).toString();
        expect(tokens).to.equal(mintAmount);
      });

      it('ecoXinit correctly funds the account', async () => {
        const mintAmount = '10';
        await ecoXInit.distributeTokens(
          ecoXProxied.address,
          [deadbeef],
          [mintAmount],
        );

        const tokens = (await ecoXProxied.balanceOf(deadbeef)).toString();
        expect(tokens).to.equal(mintAmount);
      });
    });
  });
});
