const SimplePolicySetter = artifacts.require('SimplePolicySetter');
const SimplePolicyCloner = artifacts.require('SimplePolicyCloner');
const Backdoor = artifacts.require('Backdoor');
const { expectRevert, constants } = require('@openzeppelin/test-helpers');
const util = require('../../tools/test/util');

contract('SimplePolicySetter [@group=11]', () => {
  let policy;
  let policySetter;

  beforeEach(async () => {
    ({ policy } = await util.deployPolicy());
    policySetter = await SimplePolicySetter.new();
  });

  describe('set', () => {
    context('when not already set', () => {
      it('succeeds', async () => {
        await policySetter.set(web3.utils.fromAscii('Hello'), policySetter.address);
      });

      it('can\'t set an empty key', async () => {
        await expectRevert(
          policySetter.set(web3.utils.fromAscii(''), constants.ZERO_ADDRESS),
          'The key can\'t be empty',
        );
      });

      it('sets the key', async () => {
        await policySetter.set(web3.utils.fromAscii('Hello'), policySetter.address);
        assert.equal(web3.utils.hexToAscii(await policySetter.key()).replace(/[^\x20-\x7E]/g, ''), 'Hello');
      });

      it('sets the value', async () => {
        await policySetter.set(web3.utils.fromAscii('HEllo'), policySetter.address);

        assert.equal(await policySetter.value(), policySetter.address);
      });
    });

    context('when it is already set', () => {
      beforeEach(async () => {
        await policySetter.set(web3.utils.fromAscii('Hello'), constants.ZERO_ADDRESS);
      });

      it('reverts', async () => {
        await expectRevert(
          policySetter.set(web3.utils.fromAscii('Goodbye'), constants.ZERO_ADDRESS),
          'The key/value pair has already been set',
        );
      });
    });
  });

  describe('clone', () => {
    let cloneSetter;

    beforeEach(async () => {
      cloneSetter = await SimplePolicySetter.at(
        await (await SimplePolicyCloner.new(
          web3.utils.fromAscii('Hello'),
          policySetter.address,
        )).clone(),
      );
    });

    it('returns the clone', async () => {
      assert.notEqual(cloneSetter.address, policySetter.address);
    });

    it('sets the key on the clone', async () => {
      assert.equal(web3.utils.hexToAscii(await cloneSetter.key()).replace(/[^\x20-\x7E]/g, ''), 'Hello');
    });

    it('sets the value on the clone', async () => {
      assert.equal(await cloneSetter.value(), policySetter.address);
    });
  });

  describe('enacted', () => {
    let enactablePolicy;
    beforeEach(async () => {
      enactablePolicy = await Backdoor.new(policy.address);
      await policySetter.set(web3.utils.fromAscii('Hello'), enactablePolicy.address);
    });

    it('can be enacted', async () => {
      const hash = web3.utils.fromAscii('Hello');

      await policy.testDirectVote(policySetter.address);

      assert.equal(
        await util.policyFor(policy, hash),
        enactablePolicy.address,
      );
    });
  });
});
