/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax,  no-underscore-dangle */
/* eslint-disable import/no-extraneous-dependencies, no-unused-vars */

const { ethers } = require('hardhat')

const { singletons } = require('@openzeppelin/test-helpers')

const Deploy = require('../deploy')

exports.deployPolicy = async (
  account,
  { trustees = [] } = { trustees: [] },
  voteReward = '1000',
  production = false,
  verbose = false,
  extraParams = {}
) => {
  const options = await Deploy.deploy({
    account,
    trustees,
    trusteeVoteReward: voteReward,
    production,
    verbose,
    test: true,
    ...extraParams,
  })

  const policyAd = options.policyAddress
  const ecoAd = options.ecoAddress
  const inflationAd = options.randomInflationAddress
  const vdfAd = options.vdfAddress
  const ecoxAd = options.ecoXAddress
  const rootHashProposalAd = options.rootHashProposalAddress
  const timedPoliciesAd = options.timedPoliciesAddress
  const trustedNodesAd = options.trustedNodesAddress
  const currencyTimerAd = options.currencyTimerAddress
  const lockupAd = options.lockupAddress
  const ecoXStakingAd = options.ecoXStakingAddress
  const faucetAd = options.faucetAddress

  const policy = await ethers.getContractAt('PolicyTest', policyAd)
  const eco = await ethers.getContractAt('ECO', ecoAd)
  const inflation = await ethers.getContractAt('RandomInflation', inflationAd)
  const vdf = await ethers.getContractAt('VDFVerifier', vdfAd)
  const ecox = await ethers.getContractAt('ECOx', ecoxAd)
  const rootHashProposal = await ethers.getContractAt(
    'InflationRootHashProposal',
    rootHashProposalAd
  )
  const timedPolicies = await ethers.getContractAt(
    'TimedPolicies',
    timedPoliciesAd
  )
  const trustedNodes = await ethers.getContractAt(
    'TrustedNodes',
    trustedNodesAd
  )
  const currencyTimer = await ethers.getContractAt(
    'CurrencyTimer',
    currencyTimerAd
  )
  const lockup = await ethers.getContractAt('Lockup', lockupAd)
  const ecoXStaking = await ethers.getContractAt('ECOxStaking', ecoXStakingAd)
  const faucet = await ethers.getContractAt('EcoFaucet', faucetAd)

  return {
    policy,
    eco,
    inflation,
    vdf,
    ecox,
    rootHashProposal,
    timedPolicies,
    trustedNodes,
    currencyTimer,
    lockup,
    ecoXStaking,
    faucet,
  }
}

exports.policyFor = async (policy, hash) => {
  const erc1820 = await singletons.ERC1820Registry()
  return erc1820.getInterfaceImplementer(policy.address, hash)
}
