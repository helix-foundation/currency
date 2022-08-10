const { assert } = require('chai')

const { expect } = require('chai')
const { ethers } = require('hardhat')
const time = require('../utils/time.ts')
const { ecoFixture } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')
const util = require('../../tools/test/util')

describe('TimedPolicies [@group=12]', () => {
  let policy
  let timedPolicies

  beforeEach(async () => {
    ;({ policy, timedPolicies } = await ecoFixture([]))
  })

  it('Should do a simple voting cycle', async () => {
    const policyVotesIdentifierHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['PolicyVotes']
    )
    const policyProposalsIdentifierHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['PolicyProposals']
    )

    assert.equal(await util.policyFor(policy, policyVotesIdentifierHash), 0)

    assert.notEqual(
      await util.policyFor(policy, policyProposalsIdentifierHash),
      0
    )

    const policyProposals = await ethers.getContractAt(
      'PolicyProposals',
      await util.policyFor(policy, policyProposalsIdentifierHash)
    )
    await time.increase(3600 * 24 * 15)

    assert.equal(await util.policyFor(policy, policyVotesIdentifierHash), 0)

    await policyProposals.destruct()
    assert.equal(await util.policyFor(policy, policyProposalsIdentifierHash), 0)
  })

  describe('initialize', () => {
    it('can be proxied', async () => {
      await deploy('ForwardProxy', timedPolicies.address)
    })
  })

  describe('startPolicyProposal', () => {
    context("when it's time to start a new cycle", () => {
      it('emits a PolicyDecisionStart event', async () => {
        await time.increase(3600 * 24 * 15)
        await expect(timedPolicies.incrementGeneration()).to.emit(
          timedPolicies,
          'PolicyDecisionStart'
        )
      })
    })
  })
})
