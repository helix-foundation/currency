#!/usr/bin/env node
/* eslint-disable no-param-reassign, no-console */
// # Deploying the Currency Contracts
// Currency deployment is broke into 4 distinct stages, each laying the
// foundation for the following stages. The process depends on web3-1.0, and the
// compiled JSON ABIs and deploy transaction bytecode for the contracts
// involved. It also depends on a pre-generated and pre-signed transaction to
// bootstrap the process. This transaction is generated using Nick's Method to
// keep the addresses resulting from the deployment process constant across all
// networks.

// ####### Parameters ########
/*
 * account: an account is required to be the interim owner of the contracts during the deploy
 *          and before they are initialized.
 * trustednodes: the list of addresses to be the initial trustees
 * production: boolean flag for if the deploy is to chain or should include test contracts
 * verbose: boolean flag for logging, production overrides this and is always verbose
 */

// ## Dependencies
const nick = require('./nicks');

let BLOCK_GAS_LIMIT = 6000000;
let importPath;

if (process.env.IS_COVERAGE === '1') {
  importPath = '.coverage_artifacts';
} else {
  importPath = 'build';
}

// ### Contract ABIs and Bytecode
/* eslint-disable import/no-unresolved, import/no-dynamic-require */
const PolicyABI = require(`../${importPath}/contracts/Policy.json`);
const PolicyTestABI = require(`../${importPath}/contracts/PolicyTest.json`);
const PolicyInitABI = require(`../${importPath}/contracts/PolicyInit.json`);
const EcoBootstrapABI = require(`../${importPath}/contracts/EcoBootstrap.json`);
const EcoInitializableABI = require(`../${importPath}/contracts/EcoInitializable.json`);
const TimedPoliciesABI = require(`../${importPath}/contracts/TimedPolicies.json`);
const TrustedNodesABI = require(`../${importPath}/contracts/TrustedNodes.json`);
const rootHashProposalABI = require(`../${importPath}/contracts/InflationRootHashProposal.json`);
const InflationContractABI = require(`../${importPath}/contracts/Inflation.json`);
const CurrencyGovernanceABI = require(`../${importPath}/contracts/CurrencyGovernance.json`);
const CurrencyTimerContractABI = require(`../${importPath}/contracts/CurrencyTimer.json`);
const LockupContractABI = require(`../${importPath}/contracts/Lockup.json`);
const PolicyProposalContractABI = require(`../${importPath}/contracts/PolicyProposals.json`);
const PolicyVotesContractABI = require(`../${importPath}/contracts/PolicyVotes.json`);
const ECOxLockupContractABI = require(`../${importPath}/contracts/ECOxLockup.json`);
const SimplePolicySetterABI = require(`../${importPath}/contracts/SimplePolicySetter.json`);
const ECOABI = require(`../${importPath}/contracts/ECO.json`);
const ERC20TokenABI = require(`../${importPath}/contracts/IERC20.json`);
const EcoFaucetABI = require(`../${importPath}/contracts/EcoFaucet.json`);
const EcoTestCleanupABI = require(`../${importPath}/contracts/EcoTestCleanup.json`);
const EcoTokenInitABI = require(`../${importPath}/contracts/EcoTokenInit.json`);
const VDFVerifierABI = require(`../${importPath}/contracts/VDFVerifier.json`);
const ECOxABI = require(`../${importPath}/contracts/ECOx.json`);
/* eslint-enable import/no-unresolved */

// ## PrepDeploy
// Pre-compute and sanity-check deployment. Set all relevant parameters.
async function prepDeploy(options) {
  options.gasPrice = web3.utils.toBN(await web3.eth.getGasPrice()).muln(2);
  const limit = (await web3.eth.getBlock('latest')).gasLimit;
  if (options.production) {
    options.verbose = true;
  }
  if (options.verbose) {
    console.log(`verbose deploy: ${options.verbose}`);
  }
  if (options.production) {
    options.correctPolicyABI = PolicyABI;
  } else {
    if (options.verbose) {
      console.log('This is a test, using the testing policy.');
    }
    options.correctPolicyABI = PolicyTestABI;
  }

  let bootstrapGasCost;
  let bootstrapGas;

  if (options.production) {
    if (BLOCK_GAS_LIMIT > 0.95 * limit) {
      throw Error(`Gas limit (${BLOCK_GAS_LIMIT}) too high compared to block limit (${limit}); unlikely to succeed in deploying`);
    }
    bootstrapGasCost = web3.utils.toWei(web3.utils.toBN(80), 'gwei');
    bootstrapGas = 4538418;
  } else {
    BLOCK_GAS_LIMIT = limit;
    bootstrapGasCost = options.gasPrice;
    bootstrapGas = BLOCK_GAS_LIMIT;
  }

  if (options.verbose) {
    console.log(`Deploying with gasPrice ${web3.utils.fromWei(options.gasPrice, 'gwei')} gwei and limit of ${BLOCK_GAS_LIMIT}/${limit} gas`);
  }

  // ### Bootstrap Transaction Data
  options.stage1 = JSON.parse(
    JSON.stringify(
      nick.decorateTx(
        nick.generateTx(
          EcoBootstrapABI.bytecode,
          '0x1234',
          bootstrapGas,
          bootstrapGasCost,
          web3.eth.abi.encodeParameter('address', options.account),
        ),
      ),
    ),
  );

  // ### Bootstrap Contract Interface
  options.bootstrap = new web3.eth.Contract(
    EcoBootstrapABI.abi,
    options.stage1.to,
  );

  {
  /* eslint-disable global-require */
    require('@openzeppelin/test-helpers/configure')({ web3 });
    const { singletons } = require('@openzeppelin/test-helpers');

    await singletons.ERC1820Registry(options.account);
  }

  return options;
}

// ## Deployment Stages
// As mentioned in the summary, each deployment stage lays groundwork for future
// stages. They must be run in order, and in general cannot be run multiple
// times on the same network.
//
// Stages also accumulate and pass along data for use in future stages, such as
// contract addresses and local objects for reuse. This data is stored in the
// `options` object.

// ### Stage 1
// In order to keep deployment addresses constant across all networks we use
// Nick's Method to load a bootstrap contract, which instantiates additional
// contracts to hold addresses as part of the deployment process.
//
// Each of the instatiated contracts is a forwarding proxy (`ForwardProxy`)
// pointing to a placeholder allowing the owner to set the forwarding target at
// some point in the future (`EcoIntializable`).
//
// Deploying the bootstrap contract is expensive, as the deploy instantiates
// multiple additional contracts and initializes storage. Additionally, since
// the gas price and amount must be set as part of the signed contract data
// these parameters are fixed at values that allow fast deployment on _any_
// network (i.e. they're higher than they need to be).
//
// ![Bootstrap Contract Layout](https://www.lucidchart.com/publicSegments/view/a8a95f91-de31-42cb-a33a-26f797cc31ef/image.png)
//
async function deployStage1(options) {
  // Verify that the bootstrap deployment hasn't already been done
  if (options.verbose) {
    console.log('Checking for bootstrap transaction presence...');
  }
  const codeAtAddr = await web3.eth.getCode(options.stage1.to);

  if (codeAtAddr === '0x' || codeAtAddr === '0x0') {
    // Fund the deployment account
    if (options.verbose) {
      console.log('Running bootstrap transaction...');
    }
    await web3.eth.sendTransaction({
      from: options.account,
      to: options.stage1.from,
      value: web3.utils
        .toBN(options.stage1.tx.gasLimit)
        .mul(web3.utils.toBN(options.stage1.tx.gasPrice)),
      gas: BLOCK_GAS_LIMIT,
    });
    // Issue the pre-signed deployment transaction
    await web3.eth.sendSignedTransaction(options.stage1.raw);
  } else if (options.verbose) {
    console.log('Bootstrap stage already deployed');
  }

  return options;
}

// ### Stage 2
// Once the initial proxy addresses are allocated we begin replacing the proxy
// targets of select addresses to construct the policy structure. Policy targets
// are always configured by a `PolicyInit` contract, so we deploy one and use
// the `EcoInitializable` at the 0th reserved address to redirect the address
// to the new `PolicyInit` instance.
//
// Afterwards, we deploy the currency implementation contracts (`ECO`, `ECOx`).
// The addresses of the currency implementation contracts are stored for the
// next stage. We also deploy `InflationRootHashProposal` which is a contract for
// submitting a Merkel hash of all balances, used in governance.
//
// ![Step 2 of Policy Setup](https://www.lucidchart.com/publicSegments/view/ddd05c82-5b4b-4742-9f37-666ffd318261/image.png)
//
async function deployStage2(options) {
  if (options.verbose) {
    console.log(`Bootstrap contract address: ${options.stage1.to}`);
  }
  // Lookup proxy addresses
  const policyProxyAddress = await options.bootstrap.methods
    .placeholders(0)
    .call({ from: options.account });
  const ecoProxyAddress = await options.bootstrap.methods
    .placeholders(1)
    .call({
      from: options.account,
    });
  const ecoxProxyAddress = await options.bootstrap.methods
    .placeholders(2)
    .call({
      from: options.account,
    });

  const ecoInitPolicyProxy = new web3.eth.Contract(
    EcoInitializableABI.abi,
    policyProxyAddress,
  );

  if (options.verbose) {
    console.log('deploying policy initialization contract...');
  }
  const policyInit = await new web3.eth.Contract(PolicyInitABI.abi)
    .deploy({
      data: PolicyInitABI.bytecode,
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });

  if (options.verbose) {
    console.log(
      'binding proxy 0 to policy initialization contract...',
      policyProxyAddress,
      ecoInitPolicyProxy.options.address,
      policyInit.options.address,
    );
  }
  await ecoInitPolicyProxy.methods['fuseImplementation(address)'](
    policyInit.options.address,
  ).send({
    from: options.account,
    gas: BLOCK_GAS_LIMIT,
    gasPrice: options.gasPrice,
  });

  options.policyProxy = new web3.eth.Contract(
    options.correctPolicyABI.abi,
    policyProxyAddress,
  );

  // Deploy the root hash
  if (options.verbose) {
    console.log('deploying Root Hash...');
  }

  const rootHashProposal = await new web3.eth.Contract(
    rootHashProposalABI.abi,
  )
    .deploy({
      data: rootHashProposalABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });

  options.rootHashProposal = rootHashProposal;

  // Deploy the implementation contracts
  if (options.verbose) {
    console.log('deploying the ECO implementation contract...');
  }
  const ecoImpl = await new web3.eth.Contract(ECOABI.abi)
    .deploy({
      data: ECOABI.bytecode,
      arguments: [options.policyProxy.options.address, options.rootHashProposal.options.address],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });

  if (options.verbose) {
    console.log('deploying the ECOx implementation contract...');
  }
  const ecoxImpl = await new web3.eth.Contract(ECOxABI.abi)
    .deploy({
      data: ECOxABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
        '1000000000000000000000', // TODO: make this a parameter
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  if (options.verbose) {
    console.log('binding proxy 1 to the ECO implementation contract...');
  }
  await new web3.eth.Contract(
    EcoInitializableABI.abi,
    ecoProxyAddress,
  ).methods['fuseImplementation(address)'](ecoImpl.options.address).send({
    from: options.account,
    gas: BLOCK_GAS_LIMIT,
    gasPrice: options.gasPrice,
  });

  if (options.verbose) {
    console.log('binding proxy 2 to the ECOx implementation contract...');
  }
  await new web3.eth.Contract(
    EcoInitializableABI.abi,
    ecoxProxyAddress,
  ).methods['fuseImplementation(address)'](ecoxImpl.options.address).send({
    from: options.account,
    gas: BLOCK_GAS_LIMIT,
    gasPrice: options.gasPrice,
  });

  // Pass along the local token contract objects
  options.erc20 = new web3.eth.Contract(
    ERC20TokenABI.abi,
    ecoProxyAddress,
  );
  options.ecox = new web3.eth.Contract(
    ECOxABI.abi,
    ecoxProxyAddress,
  );

  options.balanceStore = options.erc20;
  // console.log(options.balanceStore)

  return options;
}

// ### Stage 3
// Constructing the policy set is the most complicated step of the deployment
// process. Many of the contracts deployed here are templates that are cloned
// when they are needed to help keep scope.
//
// We use two policy contracts to manage the trustee and community voting
// process (`CurrencyTimer`, `TimedPolicies`) which are not cloned, but instead
// run the generation timing and clone the necessary contracts each cycle.
//
// We have a contract for staking ECOx (`ECOxLockup`) to be able to vote.
//
// We have a helper contract for random processes that manages a Variable Delay
// Function (`VDFVerifier`).
//
// We have the template contracts for when we want to instantiate lockups or when
// we want to randomly distribute new currency (`Lockup`, `Inflation`).
//
// We have the template contracts for trustee votes (`CurrencyGovernance`) and
// the two for community votes on policy, `PolicyVotes`, `PolicyProposals`).
//
// We have a contract that manages our trustee addresses (`TrustedNodes`).
//
// We also deploy the root policy contract (`Policy`) and the contract for
// minting the initial distribution of tokens (`EcoTokenInit`).
//
// In test environments, we have two contracts, one for tearing down contrats
// we're done with (`EcoTestCleanup`) and one for freely adding tokens to the
// test accounts (`EcoFaucet`).
//
// The final part of this stage is initializing the core policy contracts and
// register our token interfaces from the previous stage with ERC1820.
//
// ![Step 3 of Policy Setup](https://www.lucidchart.com/publicSegments/view/8730274f-cb64-4605-b60c-5413723befba/image.png)
//
async function deployStage3(options) {
  // Collect up the identifiers and addresses to be used in the policy structure
  const setters = [];
  const identifiers = [];
  const addresses = [];
  // const tokenResolvers = [];

  if (options.verbose) {
    console.log('deploying policy helper contracts...');
  }
  const vdfContract = await new web3.eth.Contract(
    VDFVerifierABI.abi,
  )
    .deploy({
      data: VDFVerifierABI.bytecode,
      arguments: [options.policyProxy.options.address],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  options.vdfContract = vdfContract;

  const depositCertificatesContract = await new web3.eth.Contract(
    LockupContractABI.abi,
  )
    .deploy({
      data: LockupContractABI.bytecode,
      arguments: [options.policyProxy.options.address],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  options.depositCertificatesContract = depositCertificatesContract;
  const inflationContract = await new web3.eth.Contract(
    InflationContractABI.abi,
  )
    .deploy({
      data: InflationContractABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
        options.vdfContract.options.address,
        3,
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });

  options.inflationContract = inflationContract;

  const governanceContract = await new web3.eth.Contract(
    CurrencyGovernanceABI.abi,
  )
    .deploy({
      data: CurrencyGovernanceABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  options.governanceContract = governanceContract;

  const policyVotesContract = await new web3.eth.Contract(
    PolicyVotesContractABI.abi,
  )
    .deploy({
      data: PolicyVotesContractABI.bytecode,
      arguments: [options.policyProxy.options.address],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  options.policyVotesContract = policyVotesContract;

  const simplePolicySetterContract = await new web3.eth.Contract(
    SimplePolicySetterABI.abi,
  )
    .deploy({
      data: SimplePolicySetterABI.bytecode,
      arguments: [],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  options.simplePolicySetterContract = simplePolicySetterContract;

  const policyProposalContract = await new web3.eth.Contract(
    PolicyProposalContractABI.abi,
  )
    .deploy({
      data: PolicyProposalContractABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
        options.policyVotesContract.options.address,
        options.simplePolicySetterContract.options.address,
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  options.policyProposalContract = policyProposalContract;

  const ecoXLockupContract = await new web3.eth.Contract(
    ECOxLockupContractABI.abi,
  )
    .deploy({
      data: ECOxLockupContractABI.bytecode,
      arguments: [options.policyProxy.options.address],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  options.ecoXLockupContract = ecoXLockupContract;
  const ecoXLockupIdentifierHash = web3.utils.soliditySha3(
    'ECOxLockup',
  );
  identifiers.push(ecoXLockupIdentifierHash);
  addresses.push(ecoXLockupContract.options.address);

  // Deploy the currency timer
  if (options.verbose) {
    console.log('deploying the currency timer contract...');
  }
  const currencyTimerHash = web3.utils.soliditySha3('CurrencyTimer');
  const currencyTimerContract = await new web3.eth.Contract(
    CurrencyTimerContractABI.abi,
  )
    .deploy({
      data: CurrencyTimerContractABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
        options.governanceContract.options.address,
        options.inflationContract.options.address,
        options.depositCertificatesContract.options.address,
        options.simplePolicySetterContract.options.address,
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  options.currencyTimerContract = currencyTimerContract;
  identifiers.push(currencyTimerHash);
  setters.push(currencyTimerHash);
  addresses.push(currencyTimerContract.options.address);

  // Deploy the voting policy contract
  if (options.verbose) {
    console.log('deploying the timed actions contract...');
  }
  const tokenHash = web3.utils.soliditySha3(
    'ERC20Token',
  );
  const timedPoliciesImpl = await new web3.eth.Contract(TimedPoliciesABI.abi)
    .deploy({
      data: TimedPoliciesABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
        options.policyProposalContract.options.address,
        options.simplePolicySetterContract.options.address,
        [
          tokenHash,
          currencyTimerHash,
          ecoXLockupIdentifierHash,
        ],
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  // Update the proxy targets to the implementation contract addresses
  if (options.verbose) {
    console.log('binding proxy 5 to the TimedPolicies implementation contract...');
  }
  const timedPoliciesProxyAddress = await options.bootstrap.methods
    .placeholders(3)
    .call({
      from: options.account,
    });
  const timedPoliciesIdentifierHash = web3.utils.soliditySha3(
    'TimedPolicies',
  );
  const policyProposalsIdentifierHash = web3.utils.soliditySha3(
    'PolicyProposals',
  );
  const policyVotesIdentifierHash = web3.utils.soliditySha3(
    'PolicyVotes',
  );
  await new web3.eth.Contract(
    EcoInitializableABI.abi,
    timedPoliciesProxyAddress,
  ).methods['fuseImplementation(address)'](timedPoliciesImpl.options.address).send({
    from: options.account,
    gas: BLOCK_GAS_LIMIT,
    gasPrice: options.gasPrice,
  });
  options.timedPolicies = new web3.eth.Contract(
    TimedPoliciesABI.abi,
    timedPoliciesProxyAddress,
  );

  identifiers.push(timedPoliciesIdentifierHash);
  setters.push(timedPoliciesIdentifierHash);
  addresses.push(timedPoliciesProxyAddress);

  // Deploy the policy implementation contract
  if (options.verbose) {
    console.log('deploying the policy implementation contract...');
  }
  const policyContract = await new web3.eth.Contract(options.correctPolicyABI.abi)
    .deploy({
      data: options.correctPolicyABI.bytecode,
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  options.policyContract = policyContract;

  // Deploy the currency initialization contract
  if (options.verbose) {
    console.log('deploying the token initialization policy contract...');
  }
  const initContract = await new web3.eth.Contract(EcoTokenInitABI.abi)
    .deploy({
      data: EcoTokenInitABI.bytecode,
      arguments: [options.policyProxy.options.address],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  options.initContract = initContract;
  // Temporarily using this identifier to be allowed to do initial minting
  identifiers.push(web3.utils.soliditySha3('EcoLabs'));
  addresses.push(initContract.options.address);

  const trustedvotereward = '1000'; // TODO: make this the real value

  if (options.verbose) {
    console.log('deploying the TrustedNodes policy contract...');
    console.log('trusted addresses:', options.trustednodes);
    console.log('ecox voting reward for trusted addresses:', trustedvotereward);
  }
  const trustedNodesContract = await new web3.eth.Contract(TrustedNodesABI.abi)
    .deploy({
      data: TrustedNodesABI.bytecode,
      arguments: [options.policyProxy.options.address, options.trustednodes, trustedvotereward],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  options.trustedNodesContract = trustedNodesContract;
  identifiers.push(web3.utils.soliditySha3('TrustedNodes'));
  addresses.push(trustedNodesContract.options.address);

  // If this is not going to production, deploy the cleanup contract and the faucet
  if (!options.production) {
    if (options.verbose) {
      console.log('deploying the cleanup policy contract...');
    }
    const cleanupContract = await new web3.eth.Contract(EcoTestCleanupABI.abi)
      .deploy({
        data: EcoTestCleanupABI.bytecode,
        arguments: [options.policyProxy.options.address],
      })
      .send({
        from: options.account,
        gas: BLOCK_GAS_LIMIT,
        gasPrice: options.gasPrice,
      });
    identifiers.push(web3.utils.soliditySha3('Cleanup'));
    setters.push(web3.utils.soliditySha3('Cleanup'));
    addresses.push(cleanupContract.options.address);
    options.cleanupContract = cleanupContract;

    if (options.verbose) {
      console.log('deploying the faucet policy contract...');
    }
    const faucetContract = await new web3.eth.Contract(EcoFaucetABI.abi)
      .deploy({
        data: EcoFaucetABI.bytecode,
        arguments: [options.policyProxy.options.address],
      })
      .send({
        from: options.account,
        gas: BLOCK_GAS_LIMIT,
        gasPrice: options.gasPrice,
      });
    identifiers.push(web3.utils.soliditySha3('Faucet'));
    addresses.push(faucetContract.options.address);
    options.faucetContract = faucetContract;
  }

  // Add token interfaces and balance store to the ERC1820 interfaces lists for
  // our policy initialization action.
  identifiers.push(web3.utils.soliditySha3('ERC20Token'));
  addresses.push(options.erc20.options.address);
  // tokenResolvers.push(web3.utils.soliditySha3('ERC20Token'));

  identifiers.push(web3.utils.soliditySha3('ECOx'));
  addresses.push(options.ecox.options.address);

  setters.push(policyProposalsIdentifierHash, policyVotesIdentifierHash);
  // Initialize the policy structure and prevent any further changes
  if (options.verbose) {
    console.log('fusing policy initializer...');
  }
  const ecoInitPolicy = new web3.eth.Contract(
    PolicyInitABI.abi,
    options.policyProxy.options.address,
  );

  await ecoInitPolicy.methods
    .fusedInit(
      policyContract.options.address,
      setters,
      identifiers,
      addresses,
      // tokenResolvers,
    )
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  return options;
}

// ### Stage 4
// Here we mint some initial tokens. The initialization
// contract self-destructs on first use to prevent any possible future run.
//
// Finally, now that everything is in place, we increment the first generation
// which sends the code live to be used.
//
async function deployStage4(options) {
  if (options.verbose) {
    console.log(
      `minting initial coins using ${options.initContract.options.address} ${
        options.balanceStore.options.address
      } ${options.ecox.options.address}...`,
    );
  }
  await options.initContract.methods
    .initializeAndFuse(options.balanceStore.options.address, options.ecox.options.address)
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  if (options.verbose) {
    console.log('Incrementing initial generation');
  }
  await options.timedPolicies.methods
    .incrementGeneration()
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  return options;
}

function deploy(account, trustednodes, production, verbose) {
  return prepDeploy({
    account, trustednodes, production, verbose,
  })
    .then(deployStage1)
    .then(deployStage2)
    .then(deployStage3)
    .then(deployStage4);
  // .then(async (options) => options.erc20.options.address);
}

module.exports = {
  deploy,
};
