const { expect } = require('chai')
const time = require('../utils/time.ts')
const { ecoFixture, policyFor } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('TimedPolicies [@group=2]', () => {
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

    expect(await policyFor(policy, policyVotesIdentifierHash)).to.equal(
      ethers.constants.AddressZero
    )

    expect(await policyFor(policy, policyProposalsIdentifierHash)).to.not.equal(
      ethers.constants.AddressZero
    )

    const policyProposals = await ethers.getContractAt(
      'PolicyProposals',
      await policyFor(policy, policyProposalsIdentifierHash)
    )
    await time.increase(3600 * 24 * 14)

    expect(await policyFor(policy, policyVotesIdentifierHash)).to.equal(
      ethers.constants.AddressZero
    )

    await policyProposals.destruct()
    expect(await policyFor(policy, policyProposalsIdentifierHash)).to.equal(
      ethers.constants.AddressZero
    )
  })

  describe('initialize', () => {
    it('can be proxied', async () => {
      await deploy('ForwardProxy', timedPolicies.address)
    })
  })

  describe('startPolicyProposal', () => {
    context("when it's time to start a new cycle", () => {
      it('emits a PolicyDecisionStart event', async () => {
        await time.increase(3600 * 24 * 14)
        await expect(timedPolicies.incrementGeneration()).to.emit(
          timedPolicies,
          'PolicyDecisionStart'
        )
      })
    })
  })

  describe('incrementGeneration', () => {
    context(
      'generationEnd should be pegged to value from prev generation',
      () => {
        it('sets time correctly when increment is called exactly at generation end', async () => {
          const prevNextWindowOpen = await timedPolicies.generationEnd()
          const duration = await timedPolicies.MIN_GENERATION_DURATION()
          await time.increase(duration)
          const tx = await timedPolicies.incrementGeneration()
          await tx.wait()
          const newNextWindowOpen = await timedPolicies.generationEnd()
          expect(newNextWindowOpen).to.eq(
            ethers.BigNumber.from(prevNextWindowOpen).add(
              ethers.BigNumber.from(duration)
            )
          )
        })

        it('sets time correctly when increment is called later than generation end', async () => {
          const prevNextWindowOpen = await timedPolicies.generationEnd()
          const duration = await timedPolicies.MIN_GENERATION_DURATION()
          // make sure that it can handle multi generation gaps gracefully
          await time.increase(duration * 2)
          await time.increase(20000)
          const tx = await timedPolicies.incrementGeneration()
          await tx.wait()
          const newNextWindowOpen = await timedPolicies.generationEnd()
          expect(newNextWindowOpen).to.eq(
            ethers.BigNumber.from(prevNextWindowOpen).add(
              ethers.BigNumber.from(duration * 2)
            )
          )
        })
      }
    )
  })
})
