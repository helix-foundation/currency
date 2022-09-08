const { expect } = require('chai')

const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')
const { deploy } = require('../utils/contracts')
const { singletonsFixture } = require('../utils/fixtures')

describe('Policed [@group=11]', () => {
  const fixture = async () => {
    const accounts = await ethers.getSigners()
    await singletonsFixture((await ethers.getSigners())[0])
    const testPolicyIdentifierHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['Commander']
    )
    const policyInit = await deploy('PolicyInit')
    const forwardProxy = await deploy('ForwardProxy', policyInit.address)
    const fakePolicy = await deploy('PolicyTestPolicy')

    const commander = await deploy('FakeCommander', forwardProxy.address)
    await (
      await ethers.getContractAt('PolicyInit', forwardProxy.address)
    ).fusedInit(
      fakePolicy.address,
      [testPolicyIdentifierHash],
      [testPolicyIdentifierHash],
      [commander.address]
    )

    const policy = await ethers.getContractAt(
      'PolicyTestPolicy',
      forwardProxy.address
    )

    const testPoliced = await deploy('DummyPolicedUtils', policy.address)
    await policy.setLabel('Dummy', testPoliced.address)
    const policer = await deploy('Policer', policy.address)
    return {
      accounts,
      policy,
      testPoliced,
      policer,
      commander,
    }
  }

  let policy
  let testPoliced
  let policer
  let commander
  let accounts

  beforeEach(async () => {
    ;({ accounts, policy, testPoliced, policer, commander } = await loadFixture(
      fixture
    ))
  })

  describe('PolicedUtils', () => {
    it('matches keccak256 of identifiers', async () => {
      const ids = {
        ID_FAUCET: 'Faucet',
        ID_ECO: 'ECO',
        ID_TIMED_POLICIES: 'TimedPolicies',
        ID_TRUSTED_NODES: 'TrustedNodes',
        ID_POLICY_PROPOSALS: 'PolicyProposals',
        ID_POLICY_VOTES: 'PolicyVotes',
        ID_CURRENCY_GOVERNANCE: 'CurrencyGovernance',
        ID_CURRENCY_TIMER: 'CurrencyTimer',
        ID_ECOX: 'ECOx',
        ID_ECOXSTAKING: 'ECOxStaking',
      }
      await Promise.all(
        Object.entries(ids).map(async ([key, value]) => {
          expect(
            await commander[`GET_${key}`](),
            `${key} != keccak(${value})`
          ).to.equal(ethers.utils.solidityKeccak256(['string'], [value]))
        })
      )
    })

    it('rejects ERC1820 calls from non-policy objects', async () => {
      await expect(
        testPoliced.canImplementInterfaceForAddress(
          ethers.utils.zeroPad('0x1234', 32),
          testPoliced.address
        )
      ).to.be.revertedWith(
        'Only the policy or interface contract can set the interface'
      )
    })

    it('only allows ERC1820 registration for the root policy', async () => {
      const registrationAttemptContract = await deploy(
        'RegistrationAttemptContract',
        testPoliced.address,
        'CurrencyGovernance'
      )

      await expect(registrationAttemptContract.register()).to.be.revertedWith(
        'Only the policy or interface contract can set the interface'
      )
    })
  })

  describe('Policed', () => {
    it('only allows ERC1820 registration for the root policy', async () => {
      const testRawPoliced = await deploy('DummyPoliced', policy.address)
      const registrationAttemptContract = await deploy(
        'RegistrationAttemptContract',
        testRawPoliced.address,
        'CurrencyGovernance'
      )

      await expect(registrationAttemptContract.register()).to.be.revertedWith(
        'This contract only implements interfaces for the policy contract'
      )
    })

    it('responds to canImplementInterfaceForAddress', async () => {
      const testRawPoliced = await deploy('DummyPoliced', policy.address)
      await testRawPoliced.canImplementInterfaceForAddress(
        ethers.constants.HashZero,
        policy.address
      )
    })
  })

  it('Should set values on the dummy object', async () => {
    expect(await testPoliced.value()).to.equal(1)
    await commander
      .connect(accounts[2])
      .command(testPoliced.address, policer.address)
    expect(await testPoliced.value()).to.equal(3)
  })

  it('does not allow non-approved callers to run internalCommand', async () => {
    const cmd = await deploy('FakeCommander', policy.address)
    await expect(
      cmd.command(testPoliced.address, policer.address)
    ).to.be.revertedWith('Caller is not the authorized address for identifier')
  })

  it('Policer should not allow calls from non-policy', async () => {
    await expect(policer.doit()).to.be.revertedWith(
      'Only the policy contract may call this method'
    )
  })

  it('Policed should not allow calls from non-policy', async () => {
    const iface = new ethers.utils.Interface(['function doit()'])
    await expect(
      testPoliced.policyCommand(policer.address, iface.getSighash('doit'))
    ).to.be.revertedWith('Only the policy contract may call this method')
  })

  it('Should modifier-reject calls from wrong address', async () => {
    const inflation = await deploy('DummyInflation', policy.address)
    await expect(inflation.callModifierTest()).to.be.revertedWith(
      'Only the inflation contract may call this function'
    )
  })

  it('Should modifier-allow calls from "inflation"', async () => {
    const inflation = await deploy('DummyInflation', policy.address)
    await policy.setLabel('CurrencyGovernance', inflation.address)
    await inflation.callModifierTest()
    // This will revert if the test fails
  })

  it('Should be cloneable', async () => {
    const { testPoliced: policied } = await fixture()
    await policied.cloneMe()
    const clone = await deploy('DummyPolicedUtils', await policied.c())
    expect(await policied.value()).to.equal(await clone.value())
  })

  it('Clones should not be cloneable', async () => {
    await testPoliced.cloneMe()
    const clone = await ethers.getContractAt(
      'DummyPolicedUtils',
      await testPoliced.c()
    )
    await expect(clone.cloneMe()).to.be.revertedWith(
      'This method cannot be called on clones'
    )
  })

  it('responds to setExpectedInterfaceSet', async () => {
    const testRawPolicedUtils = await deploy(
      'DummyPolicedUtils',
      policy.address
    )
    await policy.setExpected(
      testRawPolicedUtils.address,
      await accounts[1].getAddress()
    )
  })

  it('reverts on setExpectedInterfaceSet from non-policy', async () => {
    const testRawPolicedUtils = await deploy(
      'DummyPolicedUtils',
      policy.address
    )
    await expect(
      testRawPolicedUtils
        .connect(accounts[1])
        .setExpectedInterfaceSet(await accounts[1].getAddress())
    ).to.be.revertedWith('Only the policy contract may call this method')
  })

  it('setExpectedInterfaceSet allows delegated canImplementInterfaceForAddress', async () => {
    const testRawPolicedUtils = await deploy(
      'DummyPolicedUtils',
      policy.address
    )
    await policy.setExpected(
      testRawPolicedUtils.address,
      await accounts[1].getAddress()
    )
    await testRawPolicedUtils.canImplementInterfaceForAddress(
      ethers.constants.HashZero,
      await accounts[1].getAddress()
    )
  })
})
