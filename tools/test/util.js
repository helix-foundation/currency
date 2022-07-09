/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax,  no-underscore-dangle */
/* eslint-disable import/no-extraneous-dependencies, no-unused-vars */

const { ethers } = require('hardhat');

const { singletons } = require('@openzeppelin/test-helpers');

const Deploy = require('../deploy');
const { deploy } = require('../../test/utils/contracts');

const { trace } = require('./trace');

// const totalECOx = '1000000000000000000000';

exports.deployPolicy = async (
  account,
  { trustednodes = [] } = { trustednodes: [] },
  production = false,
  verbose = false,
  extraParams = {},
) => {
  const options = await Deploy.deploy({
    account, trustednodes, production, verbose, test: true, ...extraParams,
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
  const ecoXStakingAd = options.ecoXStakingContract._address;
  const faucetAd = options.faucetContract._address;
  const cleanupAd = options.cleanupContract._address;

  const policy = await ethers.getContractAt('PolicyTest', policyAd);
  const eco = await ethers.getContractAt('ECO', ecoAd);
  const inflation = await ethers.getContractAt('RandomInflation', inflationAd);
  const vdf = await ethers.getContractAt('VDFVerifier', vdfAd);
  const ecox = await ethers.getContractAt('ECOx', ecoxAd);
  const rootHashProposal = await ethers
    .getContractAt('InflationRootHashProposal', rootHashProposalAd);
  const timedPolicies = await ethers.getContractAt('TimedPolicies', timedPoliciesAd);
  const trustedNodes = await ethers.getContractAt('TrustedNodes', trustedNodesAd);
  const currencyTimer = await ethers.getContractAt('CurrencyTimer', currencyTimerAd);
  const lockup = await ethers.getContractAt('Lockup', lockupAd);
  const ecoXStaking = await ethers.getContractAt('ECOxStaking', ecoXStakingAd);
  const faucet = await ethers.getContractAt('EcoFaucet', faucetAd);
  const cleanup = await ethers.getContractAt('EcoTestCleanup', cleanupAd);
  const unauthedCleanup = await deploy('MurderousPolicy');

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
    ecoXStaking,
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
