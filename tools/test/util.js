/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax,  no-underscore-dangle */
/* eslint-disable import/no-extraneous-dependencies, no-unused-vars */

const PolicyInit = artifacts.require('PolicyInit');
const ForwardProxy = artifacts.require('ForwardProxy');
const ECO = artifacts.require('ECO');
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
  { trustednodes = [] } = { trustednodes: [] },
  voteReward = '1000',
  production = false,
  verbose = false,
) => {
  const options = await Deploy.deploy({
    account, trustednodes, trusteeVoteReward: voteReward, production, verbose, test: true,
  });

  const policyAd = options.policyProxy._address;
  const ecoAd = options.eco._address;
  const inflationAd = options.inflationContract._address;
  const vdfAd = options.vdfContract._address;
  const ecoxAd = options.ecox._address;
  const rootHashProposalAd = options.rootHashProposal._address;
  const timedPoliciesAd = options.timedPolicies._address;
  const trustedNodesAd = options.trustedNodes._address;
  const currencyTimerAd = options.currencyTimer._address;
  const lockupAd = options.depositCertificatesContract._address;
  const ecoXLockupAd = options.ecoXLockupContract._address;
  const faucetAd = options.faucetContract._address;
  const cleanupAd = options.cleanupContract._address;

  const policy = await Policy.at(policyAd);
  const eco = await ECO.at(ecoAd);
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
    eco,
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

exports.policyFor = async (policy, hash) => {
  const erc1820 = await singletons.ERC1820Registry();
  return erc1820.getInterfaceImplementer(policy.address, hash);
};

exports.trace = trace;
