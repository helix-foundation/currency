const { expect } = require('chai')

const time = require('../utils/time.ts')
const { ecoFixture } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('PolicyVotes [@group=8]', () => {
  let policy
  let eco
  let ecox
  let initInflation
  let policyVotes
  let proposal
  let timedPolicies
  const one = ethers.utils.parseEther('1')

  let alice
  let bob
  let charlie
  let dave
  let frank

  const multiplier = 20
  const multiAmount = one.mul(1500).add(1)

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie, dave, frank] = accounts
    ;({
      policy,
      eco,
      faucet: initInflation,
      timedPolicies,
      ecox,
    } = await ecoFixture([]))

    await ecox.exchange(await ecox.balanceOf(await alice.getAddress()))
    await eco.burn(await alice.getAddress(), await eco.balanceOf(await alice.getAddress()))

    await initInflation.mint(await alice.getAddress(), one.mul(50000))
    await initInflation.mint(await bob.getAddress(), one.mul(50000))
    await initInflation.mint(await charlie.getAddress(), one.mul(52000))
    await initInflation.mint(await dave.getAddress(), one.mul(48000))

    proposal = await deploy('SampleProposal', 1)

    await time.increase(3600 * 24 * 14)
    // await timedPolicies.incrementGeneration()
  })

  it('cannot multivote', async () => {
    const multivoter = await deploy('InfiniteVote', multiplier, eco.address, proposal.address)
    await eco.connect(bob).transfer(multivoter.address, multiAmount.add(one.mul(10000)))
    await expect(multivoter.infiniteVote(timedPolicies.address, policy.address)).to.be.reverted

    // policyVotes = await ethers.getContractAt(
    //   'PolicyVotes',await policy.policyFor(ethers.utils.solidityKeccak256(
    //   ['string'],
    //   ['PolicyVotes']
    // )))

    // expect(await policyVotes.yesStake()).to.be.equal(multiAmount.mul(Math.floor(multiplier*11/3)))
  })

  // it('multivote gas', async () => {
  //   const multivoter = await deploy('InfiniteVote', multiplier, eco.address, proposal.address)
  //   await eco.connect(bob).transfer(multivoter.address, multiAmount.add(one.mul(10000)))
  //   const gas = await multivoter.estimateGas.infiniteVote(timedPolicies.address, policy.address)
  //   console.log(gas)
  // })

  // it('multivoting can pass a proposal', async () => {
  //   const multivoter = await deploy('InfiniteVote', multiplier, eco.address, proposal.address)
  //   await eco.connect(bob).transfer(multivoter.address, multiAmount.add(one.mul(10000)))
  //   await multivoter.infiniteVote(timedPolicies.address, policy.address)

  //   policyVotes = await ethers.getContractAt(
  //     'PolicyVotes',await policy.policyFor(ethers.utils.solidityKeccak256(
  //     ['string'],
  //     ['PolicyVotes']
  //   )))

  //   await policyVotes.execute()
  // })
})
