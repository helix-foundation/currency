const chai = require('chai');

const Policy = artifacts.require('Policy');
const PolicyInit = artifacts.require('PolicyInit');
const ForwardProxy = artifacts.require('ForwardProxy');
const FakeCommander = artifacts.require('FakeCommander');
const RevertingAction = artifacts.require('RevertingAction');
const DummyPoliced = artifacts.require('DummyPoliced');

const {
  expect,
} = chai;

const { constants, expectRevert, singletons } = require('@openzeppelin/test-helpers');

/* Most cases are covered by functionality required by other suites. This
 * suite primarily ensures that rarely-used functionality works correctly.
 */
contract('Policy [@group=11]', () => {
  let policy;

  beforeEach(async () => {
    policy = await Policy.new();
  });

  describe('removeSelf', () => {
    context('when called by not the provider of an interface', () => {
      it('does not revert', async () => {
        await policy.removeSelf(web3.utils.soliditySha3('Identifier'));
      });
    });
    context('when called by the provider of the interface', () => {
      it('removes msg.sender as the implementor', async () => {
        const registry = await singletons.ERC1820Registry();
        // TODO
        // need to have a policy address that implements a named interface
        // and is managed by an account address
        // this will allow us to call removeSelf on that policy from the account address to test it
        expect(await registry.getInterfaceImplementer(policy.address, web3.utils.soliditySha3('Identifier'))).to.equal(constants.ZERO_ADDRESS);
      });
    });
  });

  describe('policyFor', () => {
    context('when called', () => {
      it('does not revert', async () => {
        await policy.policyFor(web3.utils.soliditySha3('Identifier'));
      });
    });
  });

  describe('internalCommand', () => {
    context('when called by a not a setter interface implementer', () => {
      it('reverts', async () => {
        await expectRevert(
          /* The policy  contract itself is not a valid delegate for the
           * internalCommand action, but it doesn't matter because the call
           * will fail before trying to delegate due to permissions - which is
           * what's being tested here.
           */
          policy.internalCommand(policy.address),
          'Failed to find an appropriate permission',
        );
      });
    });

    context('when the enacted policy fails', () => {
      let commander;

      beforeEach(async () => {
        const testPolicyIdentifierHash = web3.utils.soliditySha3('Commander');

        const policyInit = await PolicyInit.new();
        const forwardProxy = await ForwardProxy.new(policyInit.address);
        policy = await Policy.new();

        commander = await FakeCommander.new(forwardProxy.address);

        await (await PolicyInit.at(forwardProxy.address)).fusedInit(
          policy.address,
          [testPolicyIdentifierHash],
          [testPolicyIdentifierHash],
          [commander.address],
          // [testPolicyIdentifierHash],
        );

        policy = await Policy.at(forwardProxy.address);
      });

      it('reverts', async () => {
        const revertingAction = await RevertingAction.new(policy.address);
        const policed = await DummyPoliced.new(policy.address);

        await expectRevert(
          commander.command(policed.address, revertingAction.address),
          'failed during delegatecall',
        );
      });
    });
  });
});
