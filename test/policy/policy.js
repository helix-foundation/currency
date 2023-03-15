const { expect } = require('chai')

const { loadFixture } = require('@nomicfoundation/hardhat-network-helpers')
const { deploy } = require('../utils/contracts')
const { singletonsFixture } = require('../utils/fixtures')

/*
 * Most cases are covered by functionality required by other suites. This
 * suite primarily ensures that rarely-used functionality works correctly.
 */
describe('Policy [@group=2]', () => {
  const fixture = async () => {
    const accounts = await ethers.getSigners()
    const registry = await singletonsFixture(accounts[0])
    const policy = await deploy('Policy')
    return { registry, policy }
  }

  let policy
  let registry

  beforeEach(async () => {
    ;({ registry, policy } = await loadFixture(fixture))
  })

  describe('removeSelf', () => {
    describe('when called by not the provider of an interface', () => {
      it('does not revert', async () => {
        await policy.removeSelf(
          ethers.utils.solidityKeccak256(['string'], ['Identifier'])
        )
      })
    })
    describe('when called by the provider of the interface', () => {
      it('removes msg.sender as the implementor', async () => {
        // TODO
        // need to have a policy address that implements a named interface
        // and is managed by an account address
        // this will allow us to call removeSelf on that policy from the account address to test it
        expect(
          await registry.getInterfaceImplementer(
            policy.address,
            ethers.utils.solidityKeccak256(['string'], ['Identifier'])
          )
        ).to.equal(ethers.constants.AddressZero)
      })
    })
  })

  describe('policyFor', () => {
    describe('when called', () => {
      it('does not revert', async () => {
        await policy.policyFor(
          ethers.utils.solidityKeccak256(['string'], ['Identifier'])
        )
      })
    })
  })

  describe('internalCommand', () => {
    let commander
    let testPolicyIdentifierHash

    beforeEach(async () => {
      testPolicyIdentifierHash = ethers.utils.solidityKeccak256(
        ['string'],
        ['Commander']
      )

      const policyInit = await deploy('PolicyInit')
      const forwardProxy = await deploy('ForwardProxy', policyInit.address)
      policy = await deploy('Policy')

      commander = await deploy('FakeCommander', forwardProxy.address)

      await (
        await ethers.getContractAt('PolicyInit', forwardProxy.address)
      ).fusedInit(
        policy.address,
        [testPolicyIdentifierHash],
        [testPolicyIdentifierHash],
        [commander.address]
        // [testPolicyIdentifierHash],
      )

      policy = await ethers.getContractAt('Policy', forwardProxy.address)
    })
    describe('when called by a not a setter interface implementer', () => {
      /* The policy  contract itself is not a valid delegate for the
       * internalCommand action, but it doesn't matter because the call
       * will fail before trying to delegate due to permissions - which is
       * what's being tested here.
       */
      it('reverts if the auth is not a setter', async () => {
        const nonSetterHash = ethers.utils.solidityKeccak256(
          ['string'],
          ['Unauthed']
        )

        await expect(
          policy.internalCommand(policy.address, nonSetterHash)
        ).to.be.revertedWith(
          'Identifier hash is not authorized for this action'
        )
      })

      it('reverts if the auth is not the caller', async () => {
        await expect(
          policy.internalCommand(policy.address, testPolicyIdentifierHash)
        ).to.be.revertedWith(
          'Caller is not the authorized address for identifier'
        )
      })
    })

    describe('when the enacted policy fails', () => {
      it('reverts', async () => {
        const revertingAction = await deploy('RevertingAction', policy.address)
        const policed = await deploy('DummyPolicedUtils', policy.address)

        await expect(
          commander.command(policed.address, revertingAction.address)
        ).to.be.revertedWith('Command failed during delegatecall')
      })
    })
  })
})
