/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax */
/* eslint-disable import/no-extraneous-dependencies */

const PolicyInit = artifacts.require('PolicyInit');
const ForwardProxy = artifacts.require('ForwardProxy');
const ERC20EcoToken = artifacts.require('ERC20EcoToken');
const ECOx = artifacts.require('ECOx');
const ECOxLockup = artifacts.require('ECOxLockup');
const Inflation = artifacts.require('Inflation');
const Policy = artifacts.require('PolicyTest');
const VDFVerifier = artifacts.require('VDFVerifier');
const RootHashProposal = artifacts.require('InflationRootHashProposal');
const TimedPolicies = artifacts.require('TimedPolicies');
const TrustedNodes = artifacts.require('TrustedNodes');
const EcoFaucet = artifacts.require('EcoFaucet');
const CurrencyGovernance = artifacts.require('CurrencyGovernance');
const CurrencyTimer = artifacts.require('CurrencyTimer');
const SimplePolicySetter = artifacts.require('SimplePolicySetter');
const Lockup = artifacts.require('Lockup');
const PolicyVotes = artifacts.require('PolicyVotes');
const PolicyProposals = artifacts.require('PolicyProposals');
const Cleanup = artifacts.require('MurderousPolicy');

const { singletons } = require('@openzeppelin/test-helpers');

const { trace } = require('./trace');

const totalECOx = '1000000000000000000000';

exports.deployPolicy = async ({ trustees = [] } = {}) => {
  const timedPoliciesIdentifierHash = web3.utils.soliditySha3('TimedPolicies');
  const policyProposalsIdentifierHash = web3.utils.soliditySha3('PolicyProposals');
  const policyVotesIdentifierHash = web3.utils.soliditySha3('PolicyVotes');
  const tokenHash = web3.utils.soliditySha3('ERC20Token');
  const ecoxHash = web3.utils.soliditySha3('ECOx');
  const ecoxLockupHash = web3.utils.soliditySha3('ECOxLockup');
  const trustedNodesHash = web3.utils.soliditySha3('TrustedNodes');
  const faucetHash = web3.utils.soliditySha3('Faucet');
  const currencyTimerHash = web3.utils.soliditySha3('CurrencyTimer');
  const cleanupHash = web3.utils.soliditySha3('ContractCleanup');
  const unknownPolicyIDHash = web3.utils.soliditySha3('bobingy');

  const init = await PolicyInit.new();
  const proxy = await ForwardProxy.new(init.address);

  const rootHash = await RootHashProposal.new(proxy.address);
  const token = await ERC20EcoToken.new(proxy.address, rootHash.address);
  const ecox = await ECOx.new(proxy.address, totalECOx);
  const vdf = await VDFVerifier.new(proxy.address);
  const authedCleanup = await Cleanup.new();
  const unauthedCleanup = await Cleanup.new();

  const inflation = await Inflation.new(proxy.address, vdf.address, 2);
  const trustedNodes = await TrustedNodes.new(proxy.address, trustees, 1000);
  const faucet = await EcoFaucet.new(proxy.address);
  const borda = await CurrencyGovernance.new(proxy.address);
  const lockup = await Lockup.new(proxy.address);
  const ecoxlockup = await ECOxLockup.new(proxy.address);

  const policySetter = await SimplePolicySetter.new();

  const policyVotes = await PolicyVotes.new(proxy.address);
  const policyProposals = await PolicyProposals.new(
    proxy.address,
    policyVotes.address,
    policySetter.address,
  );

  const currencyTimer = await CurrencyTimer.new(
    proxy.address,
    borda.address,
    inflation.address,
    lockup.address,
    policySetter.address,
  );

  const timedPolicies = await TimedPolicies.new(
    proxy.address,
    policyProposals.address,
    policySetter.address,
    [tokenHash, currencyTimerHash, ecoxLockupHash],
  );

  await (await PolicyInit.at(proxy.address)).fusedInit(
    (await Policy.new()).address,
    [
      timedPoliciesIdentifierHash,
      policyProposalsIdentifierHash,
      policyVotesIdentifierHash,
      currencyTimerHash,
      cleanupHash,
    ],
    [
      tokenHash,
      ecoxHash,
      timedPoliciesIdentifierHash,
      trustedNodesHash,
      faucetHash,
      currencyTimerHash,
      ecoxLockupHash,
      cleanupHash,
      unknownPolicyIDHash,
    ],
    [
      token.address,
      ecox.address,
      timedPolicies.address,
      trustedNodes.address,
      faucet.address,
      currencyTimer.address,
      ecoxlockup.address,
      authedCleanup.address,
      unauthedCleanup.address,
    ],
    [tokenHash],
  );

  await timedPolicies.incrementGeneration();

  const initInflation = {
    mint: async (store, account, balance) => {
      await faucet.mint(account, balance);
    },
  };

  return {
    policy: (await Policy.at(proxy.address)),
    balanceStore: token,
    token,
    initInflation,
    inflation,
    vdf,
    ecox,
    rootHash,
    timedPolicies,
    trustedNodes,
    currencyTimer,
    lockup,
    ecoxlockup,
    faucet,
    authedCleanup,
    unauthedCleanup,
  };
};

exports.policyFor = async (policy, hash) => {
  const erc1820 = await singletons.ERC1820Registry();
  return erc1820.getInterfaceImplementer(policy.address, hash);
};

exports.trace = trace;
