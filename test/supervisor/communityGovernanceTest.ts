/* eslint-disable no-unused-vars */
/* eslint-disable camelcase */
import { ethers } from 'hardhat'
import { expect } from 'chai'
import {
  Policy,
  ECO,
  TrustedNodes,
  TrustedNodes__factory,
  TrusteeReplacement,
} from '../../typechain-types'
import { Signer } from 'ethers'
import { Supervisor } from '../../supervisor/supervisor'
import { TimeGovernor } from '../../supervisor/timeGovernor'
import { CommunityGovernor } from '../../supervisor/communityGovernor'

import { ecoFixture } from '../utils/fixtures'

import time from '../utils/time'

const ID_TRUSTED_NODES = ethers.utils.solidityKeccak256(
  ['string'],
  ['TrustedNodes']
)
const ID_POLICY_VOTES = ethers.utils.solidityKeccak256(
  ['string'],
  ['PolicyVotes']
)

async function trusteeReplacementProposal(newTrusteeSet: string[]) {
  const TRFactory = await ethers.getContractFactory('TrusteeReplacement')
  const trusteeReplacement = await TRFactory.deploy(newTrusteeSet)
  await trusteeReplacement.deployed()
  return trusteeReplacement
}

describe('CommunityGovernor [@group=13]', () => {
  let alice: Signer
  let bob: Signer
  let charlie: Signer

  let policy: Policy
  let eco: ECO
  let initInflation

  let supervisor: Supervisor
  let timeGovernor: TimeGovernor
  let communityGovernor: CommunityGovernor

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie] = accounts
    const trustees = [await alice.getAddress(), await bob.getAddress()]
    ;({ policy, eco, faucet: initInflation } = await ecoFixture(trustees))

    await initInflation.mint(
      await alice.getAddress(),
      '5000000000000000000000000000'
    )
    await initInflation.mint(
      await bob.getAddress(),
      '5000000000000000000000000000'
    )

    supervisor = new Supervisor()
    await supervisor.startTestSupervisor(policy, alice)
    timeGovernor = supervisor.timeGovernor
    communityGovernor = supervisor.communityGovernor
  })

  afterEach(async () => {
    await supervisor.killAllListeners()
  })

  it('fetches new PolicyProposals + starts listeners', async () => {
    const oldPolicyProposalsAddress: string =
      communityGovernor.policyProposals.address
    await time.increase(3600 * 24 * 14.1)
    await time.waitBlockTime()

    const newPolicyProposals = communityGovernor.policyProposals

    expect(newPolicyProposals.address).to.not.eq(oldPolicyProposalsAddress)
    expect(await newPolicyProposals.listenerCount()).to.eq(2)
  })

  it('deploys and references policyVotes', async () => {
    await time.increase(3600 * 24 * 14.1)
    await time.waitBlockTime()

    expect(communityGovernor.policyVotes).to.be.undefined

    const newProposal: TrusteeReplacement = await trusteeReplacementProposal([
      await charlie.getAddress(),
    ])
    await eco
      .connect(alice)
      .approve(
        communityGovernor.policyProposals.address,
        await communityGovernor.policyProposals.COST_REGISTER()
      )
    await communityGovernor.policyProposals.registerProposal(
      newProposal.address
    )

    await communityGovernor.policyProposals
      .connect(alice)
      .support(newProposal.address)

    await time.waitBlockTime()

    expect(communityGovernor.policyVotes.address).to.not.eq(
      ethers.constants.AddressZero
    )
  })
  it('executes', async () => {
    await time.increase(3600 * 24 * 14.1)
    await time.waitBlockTime()
    expect(communityGovernor.triedExecute).to.be.false
    let trustedNodes: TrustedNodes = TrustedNodes__factory.connect(
      await policy.policyFor(ID_TRUSTED_NODES),
      alice
    )
    expect((await trustedNodes.numTrustees()).toNumber()).to.eq(2)

    const newProposal: TrusteeReplacement = await trusteeReplacementProposal([
      await charlie.getAddress(),
    ])
    await eco
      .connect(alice)
      .approve(
        communityGovernor.policyProposals.address,
        await communityGovernor.policyProposals.COST_REGISTER()
      )
    await communityGovernor.policyProposals.registerProposal(
      newProposal.address
    )

    await communityGovernor.policyProposals
      .connect(alice)
      .support(newProposal.address)
    await time.waitBlockTime()

    expect(await policy.policyFor(ID_POLICY_VOTES)).to.not.eq(
      ethers.constants.AddressZero
    )

    await communityGovernor.policyVotes.connect(alice).vote(true)

    const reqTime: number =
      (await communityGovernor.policyVotes.voteEnds()).toNumber() +
      (await communityGovernor.policyVotes.ENACTION_DELAY()).toNumber()
    const currTime: number = await time.latestBlockTimestamp()

    await time.increase(reqTime - currTime + 1)
    await time.waitBlockTime(15000)

    expect(communityGovernor.triedExecute).to.be.true
    expect(await policy.policyFor(ID_POLICY_VOTES)).to.eq(
      ethers.constants.AddressZero
    )

    trustedNodes = TrustedNodes__factory.connect(
      await policy.policyFor(ID_TRUSTED_NODES),
      alice
    )
    expect((await trustedNodes.numTrustees()).toNumber()).to.eq(1)
  })
})
