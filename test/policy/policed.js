const PolicyTestPolicy = artifacts.require('PolicyTestPolicy');
const DummyPoliced = artifacts.require('DummyPoliced');
const DummyInflation = artifacts.require('DummyInflation');
const Policer = artifacts.require('Policer');
const FakeCommander = artifacts.require('FakeCommander');
const PolicyInit = artifacts.require('PolicyInit');
const ForwardProxy = artifacts.require('ForwardProxy');
const Policed = artifacts.require('Policed');
const RegistrationAttemptContract = artifacts.require(
  'RegistrationAttemptContract',
);

const { expectRevert } = require('@openzeppelin/test-helpers');

contract('Policed [@group=11]', (accounts) => {
  let policy;
  let testPoliced;
  let policer;
  let commander;

  beforeEach(async () => {
    const testPolicyIdentifierHash = web3.utils.soliditySha3('Commander');

    const policyInit = await PolicyInit.new();
    const forwardProxy = await ForwardProxy.new(policyInit.address);
    const fakePolicy = await PolicyTestPolicy.new();

    commander = await FakeCommander.new(forwardProxy.address);

    await (await PolicyInit.at(forwardProxy.address)).fusedInit(
      fakePolicy.address,
      [testPolicyIdentifierHash],
      [testPolicyIdentifierHash],
      [commander.address],
      [testPolicyIdentifierHash],
    );

    policy = await PolicyTestPolicy.at(forwardProxy.address);

    testPoliced = await DummyPoliced.new(policy.address);
    await policy.setLabel('Dummy', testPoliced.address);
    policer = await Policer.new(policy.address);
  });

  describe('PolicedUtils', () => {
    it('matches keccak256 of identifiers', async () => {
      const ids = {
        ID_FAUCET: 'Faucet',
        ID_ERC20TOKEN: 'ERC20Token',
        ID_CLEANUP: 'ContractCleanup',
        ID_TIMED_POLICIES: 'TimedPolicies',
        ID_TRUSTED_NODES: 'TrustedNodes',
        ID_POLICY_PROPOSALS: 'PolicyProposals',
        ID_POLICY_VOTES: 'PolicyVotes',
        ID_ECO_LABS: 'EcoLabs',
        ID_CURRENCY_GOVERNANCE: 'CurrencyGovernance',
        ID_CURRENCY_TIMER: 'CurrencyTimer',
        ID_ECOX: 'ECOx',
        ID_ECOXLOCKUP: 'ECOxLockup',
      };
      await Promise.all(Object.entries(ids).map(async ([key, value]) => {
        assert.equal(await commander[key](), web3.utils.soliditySha3(value), `${key} != keccak(${value})`);
      }));
    });

    it('rejects ERC1820 calls from non-policy objects', async () => {
      await expectRevert(
        testPoliced.canImplementInterfaceForAddress('0x1234', testPoliced.address),
        'Only the policy or interface contract may call this function',
      );
    });

    it('only allows ERC1820 registration for the root policy', async () => {
      const registrationAttemptContract = await RegistrationAttemptContract.new(
        testPoliced.address,
        'CurrencyGovernance',
      );

      await expectRevert(
        registrationAttemptContract.register(),
        'Only the policy or interface contract may call this function',
      );
    });
  });

  describe('Policed', () => {
    it('only allows ERC1820 registration for the root policy', async () => {
      const testRawPoliced = await Policed.new(policy.address);
      const registrationAttemptContract = await RegistrationAttemptContract.new(
        testRawPoliced.address,
        'CurrencyGovernance',
      );

      await expectRevert(
        registrationAttemptContract.register(),
        'contract only implements interfaces for the policy contract',
      );
    });

    it('responds to canImplementInterfaceForAddress', async () => {
      const testRawPoliced = await Policed.new(policy.address);
      await testRawPoliced.canImplementInterfaceForAddress('0x00', policy.address);
    });
  });

  it('Should set values on the dummy object', async () => {
    assert.equal(await testPoliced.value(), 1);
    await commander.command(testPoliced.address, policer.address, { from: accounts[2] });
    assert.equal(await testPoliced.value(), 3);
  });

  it('does not allow non-approved callers to run internalCommand', async () => {
    const cmd = await FakeCommander.new(policy.address);
    await expectRevert(
      cmd.command(testPoliced.address, policer.address),
      'Failed to find an appropriate permission for the delegate address.',
    );
  });

  it('Policer should not allow calls from non-policy', async () => {
    await expectRevert(
      policer.doit(),
      'Only the policy contract',
    );
  });

  it('Policed should not allow calls from non-policy', async () => {
    await expectRevert(
      testPoliced.policyCommand(
        policer.address,
        web3.eth.abi.encodeFunctionSignature('doit()'),
      ),
      'Only the policy contract',
    );
  });

  it('Should modifier-reject calls from wrong address', async () => {
    const inflation = await DummyInflation.new(policy.address);
    await expectRevert(
      inflation.callModifierTest(),
      'Only the inflation contract',
    );
  });

  it('Should modifier-allow calls from "inflation"', async () => {
    const inflation = await DummyInflation.new(policy.address);
    await policy.setLabel('CurrencyGovernance', inflation.address);
    await inflation.callModifierTest();
    // This will revert if the test fails
  });

  it('Should be cloneable', async () => {
    await testPoliced.cloneMe();
    const clone = await DummyPoliced.at(await testPoliced.c());
    assert.equal(
      (await testPoliced.value()).toString(),
      (await clone.value()).toString(),
    );
  });
});
