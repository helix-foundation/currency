#!/usr/bin/env node
/* eslint-disable no-param-reassign, no-console */
// # Deploying the Currency Contracts
// Currency deployment is broke into six distinct stages, each laying the
// foundation for the following stages. The process depends on web3-1.0, and the
// compiled JSON ABIs and deploy transaction bytecode for the contracts
// involved. It also depends on a pre-generated and pre-signed transaction to
// bootstrap the process. This transaction is generated using Nick's Method to
// keep the addresses resulting from the deployment process constant across all
// networks.

// ####### Parameters ########

// ## Dependencies
const nick = require('./nicks');

const BLOCK_GAS_LIMIT = 6000000;

// ### Contract ABIs and Bytecode
/* eslint-disable import/no-unresolved */
const PolicyABI = require('../build/contracts/Policy.json');
const PolicyInitABI = require('../build/contracts/PolicyInit.json');
const EcoBootstrapABI = require('../build/contracts/EcoBootstrap.json');
const EcoInitializableABI = require('../build/contracts/EcoInitializable.json');
const TimedPoliciesABI = require('../build/contracts/TimedPolicies.json');
const TrustedNodesABI = require('../build/contracts/TrustedNodes.json');
const rootHashProposalABI = require('../build/contracts/InflationRootHashProposal.json');
const InflationContractABI = require('../build/contracts/Inflation.json');
const CurrencyGovernanceABI = require('../build/contracts/CurrencyGovernance.json');
const CurrencyTimerContractABI = require('../build/contracts/CurrencyTimer.json');
const LockupContractABI = require('../build/contracts/Lockup.json');
const PolicyProposalContractABI = require('../build/contracts/PolicyProposals.json');
const PolicyVotesContractABI = require('../build/contracts/PolicyVotes.json');
const SimplePolicySetterABI = require('../build/contracts/SimplePolicySetter.json');
const EcoBalanceStoreABI = require('../build/contracts/EcoBalanceStore.json');
const ERC777EcoTokenABI = require('../build/contracts/ERC777EcoToken.json');
const ERC20EcoTokenABI = require('../build/contracts/ERC20EcoToken.json');
const ERC20TokenABI = require('../build/contracts/IERC20.json');
const EcoFaucetABI = require('../build/contracts/EcoFaucet.json');
const EcoTestCleanupABI = require('../build/contracts/EcoTestCleanup.json');
const EcoTokenInitABI = require('../build/contracts/EcoTokenInit.json');
const VDFVerifierABI = require('../build/contracts/VDFVerifier.json');
const ECOxABI = require('../build/contracts/ECOx.json');

/* eslint-enable import/no-unresolved */

// ## PrepDeploy
// Pre-compute and sanity-check deployment
async function prepDeploy(options) {
  options.gasPrice = web3.utils.toBN(await web3.eth.getGasPrice()).muln(2);
  const limit = (await web3.eth.getBlock('latest')).gasLimit;

  console.log(`Deploying with gasPrice ${web3.utils.fromWei(options.gasPrice, 'gwei')} gwei and limit of ${BLOCK_GAS_LIMIT}/${limit} gas`);

  if (BLOCK_GAS_LIMIT > 0.95 * limit) {
    throw Error(`Gas limit (${BLOCK_GAS_LIMIT}) too high compared to block limit (${limit}); unlikely to succeed in deploying`);
  }

  const cost = web3.utils.toWei(web3.utils.toBN(80), 'gwei');

  // ### Bootstrap Transaction Data
  options.stage1 = JSON.parse(
    JSON.stringify(
      nick.decorateTx(
        nick.generateTx(
          EcoBootstrapABI.bytecode,
          '0x1234',
          4538418,
          cost,
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
// contract addresses and local objects for reuse.

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
// network (ie they're higher than they need to be).
//
// ![Bootstrap Contract Layout](https://www.lucidchart.com/publicSegments/view/a8a95f91-de31-42cb-a33a-26f797cc31ef/image.png)
//
async function deployStage1(options) {
  // Verify that the bootstrap deployment hasn't already been done
  console.log('Checking for bootstrap transaction presence...');
  const codeAtAddr = await web3.eth.getCode(options.stage1.to);

  if (codeAtAddr === '0x' || codeAtAddr === '0x0') {
    // Fund the deployment account
    console.log('Running bootstrap transaction...');
    await web3.eth.sendTransaction({
      from: options.account,
      to: options.stage1.from,
      value: web3.utils
        .toBN(options.stage1.tx.gasLimit)
        .mul(web3.utils.toBN(options.stage1.tx.gasPrice)),
      gas: 25000,
    });
    // Issue the pre-signed deployment transaction
    await web3.eth.sendSignedTransaction(options.stage1.raw);
  } else {
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
// ![Step 1 of Policy Setup](https://www.lucidchart.com/publicSegments/view/ddd05c82-5b4b-4742-9f37-666ffd318261/image.png)
//
async function deployStage2(options) {
  console.log(`Bootstrap contract address: ${options.stage1.to}`);
  // Lookup proxy addresses
  const policyProxyAddress = await options.bootstrap.methods
    .placeholders(0)
    .call({ from: options.account });
  const balanceStoreProxyAddress = await options.bootstrap.methods
    .placeholders(1)
    .call({
      from: options.account,
    });
  const erc777ProxyAddress = await options.bootstrap.methods
    .placeholders(2)
    .call({
      from: options.account,
    });
  const erc20ProxyAddress = await options.bootstrap.methods
    .placeholders(3)
    .call({
      from: options.account,
    });
  const ecoxProxyAddress = await options.bootstrap.methods
    .placeholders(4)
    .call({
      from: options.account,
    });

  const ecoInitPolicyProxy = new web3.eth.Contract(
    EcoInitializableABI.abi,
    policyProxyAddress,
  );

  console.log('deploying policy initialization contract...');
  const policyInit = await new web3.eth.Contract(PolicyInitABI.abi)
    .deploy({
      data: PolicyInitABI.bytecode,
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });

  console.log(
    'binding proxy 0 to policy initialization contract...',
    policyProxyAddress,
    ecoInitPolicyProxy.options.address,
    policyInit.options.address,
  );
  await ecoInitPolicyProxy.methods['fuseImplementation(address)'](
    policyInit.options.address,
  ).send({
    from: options.account,
    gas: BLOCK_GAS_LIMIT,
    gasPrice: options.gasPrice,
  });
  options.policyProxy = new web3.eth.Contract(
    PolicyABI.abi,
    policyProxyAddress,
  );

  // Deploy the balance store contract
  //
  // ![Deploy the Balance Store](https://www.lucidchart.com/publicSegments/view/51ba5fa7-24d5-4bdd-a3c5-bc580fb5369a/image.png)
  console.log('deploying balance store...');

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

  const balanceStoreImpl = await new web3.eth.Contract(EcoBalanceStoreABI.abi)
    .deploy({
      data: EcoBalanceStoreABI.bytecode,
      arguments: [options.policyProxy.options.address, options.rootHashProposal.options.address],
    }).send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });

  console.log(
    'binding proxy 1 to the balance store implementation contract...',
  );

  await new web3.eth.Contract(
    EcoInitializableABI.abi,
    balanceStoreProxyAddress,
  ).methods['fuseImplementation(address)'](
    balanceStoreImpl.options.address,
  ).send({
    from: options.account,
    gas: BLOCK_GAS_LIMIT,
    gasPrice: options.gasPrice,
  });
  options.balanceStoreImpl = balanceStoreImpl;
  options.balanceStore = new web3.eth.Contract(
    EcoBalanceStoreABI.abi,
    balanceStoreProxyAddress,
  );

  // Deploy the implementation contracts
  // ![Deploy the Token Interfaces](https://www.lucidchart.com/publicSegments/view/b528bda8-df21-49fd-8d8e-2e05a8875f58/image.png)
  console.log('deploying the ERC777 implementation contract...');
  const erc777Impl = await new web3.eth.Contract(ERC777EcoTokenABI.abi)
    .deploy({
      data: ERC777EcoTokenABI.bytecode,
      arguments: [options.policyProxy.options.address],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });

  console.log('deploying the ERC20 implementation contract...');
  const erc20Impl = await new web3.eth.Contract(ERC20EcoTokenABI.abi)
    .deploy({
      data: ERC20EcoTokenABI.bytecode,
      arguments: [options.policyProxy.options.address],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });

  console.log('deploying the ECOx implementation contract...');
  const ecoxImpl = await new web3.eth.Contract(ECOxABI.abi)
    .deploy({
      data: ECOxABI.bytecode,
      arguments: [options.policyProxy.options.address],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });

  // Update the proxy targets to the implementation contract addresses
  console.log('binding proxy 2 to the ERC777 implementation contract...');
  await new web3.eth.Contract(
    EcoInitializableABI.abi,
    erc777ProxyAddress,
  ).methods['fuseImplementation(address)'](erc777Impl.options.address).send({
    from: options.account,
    gas: BLOCK_GAS_LIMIT,
    gasPrice: options.gasPrice,
  });

  console.log('binding proxy 3 to the ERC20 implementation contract...');
  await new web3.eth.Contract(
    EcoInitializableABI.abi,
    erc20ProxyAddress,
  ).methods['fuseImplementation(address)'](erc20Impl.options.address).send({
    from: options.account,
    gas: BLOCK_GAS_LIMIT,
    gasPrice: options.gasPrice,
  });

  console.log('binding proxy 4 to the ECOx implementation contract...');
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
    erc20ProxyAddress,
  );
  options.erc777 = new web3.eth.Contract(
    ERC777EcoTokenABI.abi,
    erc777ProxyAddress,
  );
  options.ecox = new web3.eth.Contract(
    ECOxABI.abi,
    ecoxProxyAddress,
  );

  return options;
}

// ### Stage 3
// Constructing the policy set is the most complicated step of the deployment
// process. We use one policy contract to manage the policy and inflation voting
// process (`TimedPolicies`), another for minting initial tokens and authorizing
// the basic inteerfaces (`EcoTokenInit`), and, in test environments, a third
// for tearing down contrats we're done with (`EcoTestCleanup`).
//
// We also register the ERC1820 interfaces for our ERC20 token proxy and our
// ERC777 token proxy.
//
// ![Step 2 of Policy Setup](https://www.lucidchart.com/publicSegments/view/0fb82096-b78b-4303-b575-6c424847f9fe/image.png)
//
async function deployStage3(options) {
  // Collect up the identifiers and addresses to be used in the policy structure
  const setters = [];
  const identifiers = [];
  const addresses = [];
  const tokenResolvers = [];

  console.log('deploying policy helper contracts...');
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

  // Deploy the currency timer
  console.log('deploying the currency timer contract...');
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
  console.log('deploying the voting policy contract...');
  const timedPoliciesImpl = await new web3.eth.Contract(TimedPoliciesABI.abi)
    .deploy({
      data: TimedPoliciesABI.bytecode,
      arguments: [
        options.policyProxy.options.address,
        options.policyProposalContract.options.address,
        options.simplePolicySetterContract.options.address,
        [web3.utils.soliditySha3('BalanceStore'), web3.utils.soliditySha3('ECOx'), currencyTimerHash],
      ],
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  // Update the proxy targets to the implementation contract addresses
  console.log('binding proxy 5 to the TimedPolicies implementation contract...');
  const timedPoliciesProxyAddress = await options.bootstrap.methods
    .placeholders(5)
    .call({
      from: options.account,
    });
  const timedPoliciesIdentifierHash = web3.utils.soliditySha3(
    'TimedPolicies',
  );
  const policyProposalsIdentifierHash = web3.utils.soliditySha3(
    'PolicyProposals',
  );
  const policyVotesIdentifierHash = web3.utils.soliditySha3('PolicyVotes');
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

  // Deploy the policy implementatiaon contract
  console.log('deploying the policy implementation contract...');
  const policyContract = await new web3.eth.Contract(PolicyABI.abi)
    .deploy({
      data: PolicyABI.bytecode,
    })
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  options.policyContract = policyContract;

  // Deploy the currency initialization contract
  console.log('deploying the token initialization policy contract...');
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
  identifiers.push(web3.utils.soliditySha3('CurrencyGovernance'));
  addresses.push(initContract.options.address);

  console.log('deploying the trusted nodes policy contract...');
  console.log('trusted addresses:', options.trustednodes);
  const trustedNodesContract = await new web3.eth.Contract(TrustedNodesABI.abi)
    .deploy({
      data: TrustedNodesABI.bytecode,
      arguments: [options.policyProxy.options.address, options.trustednodes],
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
    console.log('deploying the cleanup policy contract...');
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

    console.log('deploying the faucet policy contract...');
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
  // our policy initilization action.
  identifiers.push(web3.utils.soliditySha3('ERC20Token'));
  addresses.push(options.erc20.options.address);
  tokenResolvers.push(web3.utils.soliditySha3('ERC20Token'));

  identifiers.push(web3.utils.soliditySha3('ERC777Token'));
  addresses.push(options.erc777.options.address);
  tokenResolvers.push(web3.utils.soliditySha3('ERC777Token'));

  identifiers.push(web3.utils.soliditySha3('BalanceStore'));
  addresses.push(options.balanceStore.options.address);

  identifiers.push(web3.utils.soliditySha3('ECOx'));
  addresses.push(options.ecox.options.address);

  setters.push(policyProposalsIdentifierHash, policyVotesIdentifierHash);
  // Initialize the policy structure and prevent any futher changes
  console.log('fusing policy initializer...');
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
      tokenResolvers,
    )
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  return options;
}

// ### Stage 4
// Before wallets can interact with the token interfaces they need to be
// authorized to perform actions on the balance store. Our initialization
// contract deployed in [Stage 3](#stage-3) will mint some initial tokens.
// The initialization contract self-destructs on first use to prevent any
// possible future run. The `reAuthorize` operation will cache token
// interface authorizations.
//
// ![Authorize Token Interfaces](https://www.lucidchart.com/publicSegments/view/8730274f-cb64-4605-b60c-5413723befba/image.png)
//
async function deployStage4(options) {
  console.log('recomputing authorized contracts list for balance store...');
  await options.balanceStore.methods.reAuthorize().send({
    from: options.account,
    gas: BLOCK_GAS_LIMIT,
    gasPrice: options.gasPrice,
  });
  console.log(
    `minting initial coins using ${options.initContract.options.address} ${
      options.balanceStore.options.address
    }...`,
  );
  await options.initContract.methods
    .initializeAndFuse(options.balanceStore.options.address)
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  console.log('Incrementing initial generation');
  await options.timedPolicies.methods
    .incrementGeneration()
    .send({
      from: options.account,
      gas: BLOCK_GAS_LIMIT,
      gasPrice: options.gasPrice,
    });
  return options;
}

function deploy(account, trustednodes) {
  return prepDeploy({ account, trustednodes })
    .then(deployStage1)
    .then(deployStage2)
    .then(deployStage3)
    .then(deployStage4)
    .then(async (options) => options.erc20.options.address);
}

module.exports = {
  deploy,
};
