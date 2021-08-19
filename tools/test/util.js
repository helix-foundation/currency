/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax */
/* eslint-disable import/no-extraneous-dependencies */

const PolicyInit = artifacts.require('PolicyInit');
const ForwardProxy = artifacts.require('ForwardProxy');
const EcoBalanceStore = artifacts.require('EcoBalanceStore');
const ERC20EcoToken = artifacts.require('ERC20EcoToken');
const ECOx = artifacts.require('ECOx');
const Inflation = artifacts.require('Inflation');
const FakePolicy = artifacts.require('FakePolicy');
const VDFVerifier = artifacts.require('VDFVerifier');
const RootHashProposal = artifacts.require('InflationRootHashProposal');
const TimedPolicies = artifacts.require('TimedPolicies');
const TrustedNodes = artifacts.require('TrustedNodes');
const FreeFaucet = artifacts.require('FreeFaucet');
const CurrencyGovernance = artifacts.require('CurrencyGovernance');
const CurrencyTimer = artifacts.require('CurrencyTimer');
const SimplePolicySetter = artifacts.require('SimplePolicySetter');
const Lockup = artifacts.require('Lockup');
const PolicyVotes = artifacts.require('PolicyVotes');
const PolicyProposals = artifacts.require('PolicyProposals');
const Cleanup = artifacts.require('MurderousPolicy');

const { singletons } = require('@openzeppelin/test-helpers');

const { trace } = require('./trace');

exports.deployPolicy = async ({ trustees = [] } = {}) => {
  const timedPoliciesIdentifierHash = web3.utils.soliditySha3('TimedPolicies');
  const policyProposalsIdentifierHash = web3.utils.soliditySha3('PolicyProposals');
  const policyVotesIdentifierHash = web3.utils.soliditySha3('PolicyVotes');
  const tokenHash = web3.utils.soliditySha3('ERC20Token');
  const balanceStoreIdentifierHash = web3.utils.soliditySha3('BalanceStore');
  const ecoxHash = web3.utils.soliditySha3('ECOx');
  const trustedNodesHash = web3.utils.soliditySha3('TrustedNodes');
  const faucetHash = web3.utils.soliditySha3('Faucet');
  const currencyTimerHash = web3.utils.soliditySha3('CurrencyTimer');
  const cleanupHash = web3.utils.soliditySha3('ContractCleanup');
  const unknownPolicyIDHash = web3.utils.soliditySha3('bobingy');

  const init = await PolicyInit.new();
  const proxy = await ForwardProxy.new(init.address);

  const rootHash = await RootHashProposal.new(proxy.address);
  const balanceStore = await EcoBalanceStore.new(proxy.address, rootHash.address);
  const token = await ERC20EcoToken.new(proxy.address);
  const ecox = await ECOx.new(proxy.address);
  const vdf = await VDFVerifier.new(proxy.address);
  const authedCleanup = await Cleanup.new();
  const unauthedCleanup = await Cleanup.new();

  const inflation = await Inflation.new(proxy.address, vdf.address, 2);
  const trustedNodes = await TrustedNodes.new(proxy.address, trustees);
  const faucet = await FreeFaucet.new(proxy.address);
  const borda = await CurrencyGovernance.new(proxy.address);
  const lockup = await Lockup.new(proxy.address);

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
    [balanceStoreIdentifierHash, ecoxHash, currencyTimerHash],
  );

  await (await PolicyInit.at(proxy.address)).fusedInit(
    (await FakePolicy.new()).address,
    [
      timedPoliciesIdentifierHash,
      policyProposalsIdentifierHash,
      policyVotesIdentifierHash,
      currencyTimerHash,
      cleanupHash,
    ],
    [
      tokenHash,
      balanceStoreIdentifierHash,
      ecoxHash,
      timedPoliciesIdentifierHash,
      trustedNodesHash,
      faucetHash,
      currencyTimerHash,
      cleanupHash,
      unknownPolicyIDHash,
    ],
    [
      token.address,
      balanceStore.address,
      ecox.address,
      timedPolicies.address,
      trustedNodes.address,
      faucet.address,
      currencyTimer.address,
      authedCleanup.address,
      unauthedCleanup.address,
    ],
    [tokenHash],
  );

  await balanceStore.reAuthorize();
  await timedPolicies.incrementGeneration();

  const initInflation = {
    mint: async (store, account, balance) => {
      await faucet.mint(account, balance);
    },
  };

  return {
    policy: (await FakePolicy.at(proxy.address)),
    balanceStore,
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
