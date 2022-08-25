
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

  it('Should do an empty voting cycle', async () => {
    const policyVotesIdentifierHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['PolicyVotes']
    )
    const policyProposalsIdentifierHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['PolicyProposals']
    )

    expect(await util.policyFor(policy, policyVotesIdentifierHash)).to.be.zero

    expect(await util.policyFor(policy, policyProposalsIdentifierHash)).to.not
      .be.zero

    const policyProposals = await ethers.getContractAt(
      'PolicyProposals',
      await util.policyFor(policy, policyProposalsIdentifierHash)
    )
    await time.increase(3600 * 24 * 14)

    expect(await util.policyFor(policy, policyVotesIdentifierHash)).to.be.zero

    await policyProposals.destruct()
    expect(await util.policyFor(policy, policyProposalsIdentifierHash)).to.be
      .zero
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
