/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax,  no-underscore-dangle */
/* eslint-disable import/no-extraneous-dependencies, no-unused-vars */

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
const Cleanup = artifacts.require('EcoTestCleanup');
const MurderousCleanup = artifacts.require('MurderousPolicy');

const Web3 = require('web3');

const { singletons } = require('@openzeppelin/test-helpers');

const Deploy = require('../deploy');

const { trace } = require('./trace');

// const totalECOx = '1000000000000000000000';

exports.deployPolicy = async (
  account,
  { trustees = [] } = {},
  production = false,
  verbose = false,
) => {
  const options = await Deploy.deploy(account, trustees, production, verbose);

  const policyAd = options.policyProxy._address;
  const ecoAd = options.erc20._address;
  const inflationAd = options.inflationContract._address;
  const vdfAd = options.vdfContract._address;
  const ecoxAd = options.ecox._address;
  const rootHashProposalAd = options.rootHashProposal._address;
  const timedPoliciesAd = options.timedPolicies._address;
  const trustedNodesAd = options.trustedNodesContract._address;
  const currencyTimerAd = options.currencyTimerContract._address;
  const lockupAd = options.depositCertificatesContract._address;
  const ecoXLockupAd = options.ecoXLockupContract._address;
  const faucetAd = options.faucetContract._address;
  const cleanupAd = options.cleanupContract._address;
  const balanceStoreAd = options.balanceStore._address;

  const policy = await Policy.at(policyAd);
  const eco = await ERC20EcoToken.at(ecoAd);
  const inflation = await Inflation.at(inflationAd);
  const vdf = await VDFVerifier.at(vdfAd);
  const ecox = await ECOx.at(ecoxAd);
  const rootHashProposal = await RootHashProposal.at(rootHashProposalAd);
  const timedPolicies = await TimedPolicies.at(timedPoliciesAd);
  const trustedNodes = await TrustedNodes.at(trustedNodesAd);
  const currencyTimer = await CurrencyTimer.at(currencyTimerAd);
  const lockup = await Lockup.at(lockupAd);
  const ecoXLockup = await ECOxLockup.at(ecoXLockupAd);
  const faucet = await EcoFaucet.at(faucetAd);
  const cleanup = await Cleanup.at(cleanupAd);
  const unauthedCleanup = await MurderousCleanup.new();
  const balanceStore = await ERC20EcoToken.at(balanceStoreAd);

  // await timedPolicies.incrementGeneration();
  // console.log(await ecox.name());
  // console.log((await ecox.initialSupply()).toNumber());

  const initInflation = {
    mint: async (store, acc, balance) => {
      await faucet.mint(acc, balance);
    },
  };

  return {
    policy,
    balanceStore,
    token: eco,
    initInflation,
    inflation,
    vdf,
    ecox,
    rootHashProposal,
    timedPolicies,
    trustedNodes,
    currencyTimer,
    lockup,
    ecoXLockup,
    faucet,
    cleanup,
    unauthedCleanup,
  };
};

// exports.deployPolicy = async ({ trustees = [] } = {}) => {
//   const timedPoliciesIdentifierHash = web3.utils.soliditySha3('TimedPolicies');
//   const policyProposalsIdentifierHash = web3.utils.soliditySha3('PolicyProposals');
//   const policyVotesIdentifierHash = web3.utils.soliditySha3('PolicyVotes');
//   const tokenHash = web3.utils.soliditySha3('ERC20Token');
//   const ecoxHash = web3.utils.soliditySha3('ECOx');
//   const ecoXLockupHash = web3.utils.soliditySha3('ECOxLockup');
//   const trustedNodesHash = web3.utils.soliditySha3('TrustedNodes');
//   const faucetHash = web3.utils.soliditySha3('Faucet');
//   const currencyTimerHash = web3.utils.soliditySha3('CurrencyTimer');
//   const cleanupHash = web3.utils.soliditySha3('ContractCleanup');
//   const unknownPolicyIDHash = web3.utils.soliditySha3('bobingy');

//   const init = await PolicyInit.new();
//   const proxy = await ForwardProxy.new(init.address);

//   const rootHash = await RootHashProposal.new(proxy.address);
//   const token = await ERC20EcoToken.new(proxy.address, rootHash.address);
//   const ecox = await ECOx.new(proxy.address, totalECOx);
//   const vdf = await VDFVerifier.new(proxy.address);
//   const authedCleanup = await Cleanup.new();
//   const unauthedCleanup = await Cleanup.new();

//   const inflation = await Inflation.new(proxy.address, vdf.address, 2);
//   const trustedNodes = await TrustedNodes.new(proxy.address, trustees, 1000);
//   const faucet = await EcoFaucet.new(proxy.address);
//   const borda = await CurrencyGovernance.new(proxy.address);
//   const lockup = await Lockup.new(proxy.address);
//   const ecoxlockup = await ECOxLockup.new(proxy.address);

//   const policySetter = await SimplePolicySetter.new();

//   const policyVotes = await PolicyVotes.new(proxy.address);
//   const policyProposals = await PolicyProposals.new(
//     proxy.address,
//     policyVotes.address,
//     policySetter.address,
//   );

//   const currencyTimer = await CurrencyTimer.new(
//     proxy.address,
//     borda.address,
//     inflation.address,
//     lockup.address,
//     policySetter.address,
//   );

//   const timedPolicies = await TimedPolicies.new(
//     proxy.address,
//     policyProposals.address,
//     policySetter.address,
//     [tokenHash, currencyTimerHash, ecoXLockupHash],
//   );

//   await (await PolicyInit.at(proxy.address)).fusedInit(
//     (await Policy.new()).address,
//     [
//       timedPoliciesIdentifierHash,
//       policyProposalsIdentifierHash,
//       policyVotesIdentifierHash,
//       currencyTimerHash,
//       cleanupHash,
//     ],
//     [
//       tokenHash,
//       ecoxHash,
//       timedPoliciesIdentifierHash,
//       trustedNodesHash,
//       faucetHash,
//       currencyTimerHash,
//       ecoXLockupHash,
//       cleanupHash,
//       unknownPolicyIDHash,
//     ],
//     [
//       token.address,
//       ecox.address,
//       timedPolicies.address,
//       trustedNodes.address,
//       faucet.address,
//       currencyTimer.address,
//       ecoxlockup.address,
//       authedCleanup.address,
//       unauthedCleanup.address,
//     ],
//     [tokenHash],
//   );

//   await timedPolicies.incrementGeneration();

//   const initInflation = {
//     mint: async (store, account, balance) => {
//       await faucet.mint(account, balance);
//     },
//   };

//   return {
//     policy: (await Policy.at(proxy.address)),
//     balanceStore: token,
//     token,
//     initInflation,
//     inflation,
//     vdf,
//     ecox,
//     rootHash,
//     timedPolicies,
//     trustedNodes,
//     currencyTimer,
//     lockup,
//     ecoxlockup,
//     faucet,
//     authedCleanup,
//     unauthedCleanup,
//   };
// };

exports.policyFor = async (policy, hash) => {
  const erc1820 = await singletons.ERC1820Registry();
  return erc1820.getInterfaceImplementer(policy.address, hash);
};

exports.trace = trace;
