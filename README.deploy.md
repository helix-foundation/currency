# Deploying the Currency Contracts
Currency deployment is broke into six distinct stages, each laying the
foundation for the following stages. The process depends on web3-1.0, and the
compiled JSON ABIs and deploy transaction bytecode for the contracts
involved. It also depends on a pre-generated and pre-signed transaction to
bootstrap the process. This transaction is generated using Nick's Method to
keep the addresses resulting from the deployment process constant across all
networks.

## Parameters
```js
const webrpc = 'http://localhost:8545';
const GAS_PRICE_GWEI = '1';


```
## Dependencies
### web3
```js
const Web3 = require('web3');
const linker = require('solc/linker');
const CLA = require('command-line-args');
const nick = require('./tools/nick');
const web3 = new Web3(webrpc);
const GAS_PRICE = web3.utils.toWei(GAS_PRICE_GWEI, 'Gwei');
console.log('Gas price:', GAS_PRICE);
```

### Contract ABIs and Bytecode
```js
const PolicyABI = require('./build/contracts/Policy.json');
const PolicyInitABI = require('./build/contracts/PolicyInit.json');
const EcoBootstrapABI = require('./build/contracts/EcoBootstrap.json');
const EcoInitializableABI = require('./build/contracts/EcoInitializable.json');
const TimedPoliciesABI = require('./build/contracts/TimedPolicies.json');
const TrustedNodesABI = require('./build/contracts/TrustedNodes.json');
const InflationContractABI = require('./build/contracts/Inflation.json');
const CurrencyGovernanceABI = require('./build/contracts/CurrencyGovernance.json');
const PolicyProposalContractABI = require('./build/contracts/PolicyProposals.json');
const PolicyVotesContractABI = require('./build/contracts/PolicyVotes.json');
const SimplePolicySetterABI = require('./build/contracts/SimplePolicySetter.json');
const EcoBalanceStoreABI = require('./build/contracts/EcoBalanceStore.json');
const ERC777EcoTokenABI = require('./build/contracts/ERC777EcoToken.json');
const ERC20EcoTokenABI = require('./build/contracts/ERC20EcoToken.json');
const ERC20TokenABI = require('./build/contracts/IERC20.json');
const EcoFaucetABI = require('./build/contracts/EcoFaucet.json');
const EcoTestCleanupABI = require('./build/contracts/EcoTestCleanup.json');
const EcoTokenInitABI = require('./build/contracts/EcoTokenInit.json');
const VDFVerifierABI = require('./build/contracts/VDFVerifier.json');
```

## Setup
The process assumes access to node-local accounts on the node providing RPC
services, and uses a defined constant bootstrap contract.


```js
const OPTS = [
  { name: 'fanout-tree-address', type: String, defaultValue: null }
];

```
### Account Setup Process
```js
async function setup() {
  console.log('Fetching eth node accounts');
  const nodeAccounts = await web3.eth.getAccounts();

  const options = {
    account: nodeAccounts[0],
  };

  const cla = CLA(OPTS);

  if(cla['fanout-tree-address']) {
    options.fanoutTree = cla['fanout-tree-address'];
  }
```
### Bootstrap Transaction Data
```js
  options.stage1 = JSON.parse(JSON.stringify(nick.decorateTx(nick.generateTx(require('./build/contracts/EcoBootstrap.json').bytecode,
                                                                             webrpc,
                                                                             '0x1234',
                                                                             3538418,
                                                                             web3.eth.abi.encodeParameter('address',
                                                                                                          options.account)))));

```
### Bootstrap Contract Interface
```js
  options.bootstrap = new web3.eth.Contract(EcoBootstrapABI.abi, options.stage1.to);


  await erc820(web3.currentProvider, options.account);

  return options;
}

```
## Deployment Stages
As mentioned in the summary, each deployment stage lays groundwork for future
stages. They must be run in order, and in general cannot be run multiple
times on the same network.

Stages also accumulate and pass along data for use in future stages, such as
contract addresses and local objects for reuse.

### Stage 1
In order to keep deployment addresses constant across all networks we use
Nick's Method to load a bootstrap contract, which instantiates additional
contracts to hold addresses as part of the deployment process.

Each of the instatiated contracts is a forwarding proxy (`ForwardProxy`)
pointing to a placeholder allowing the owner to set the forwarding target at
some point in the future (`EcoIntializable`).

Deploying the bootstrap contract is expensive, as the deploy instantiates
multiple additional contracts and initializes storage. Additionally, since
the gas price and amount must be set as part of the signed contract data
these parameters are fixed at values that allow fast deployment on _any_
network (ie they're higher than they need to be).

![Bootstrap Contract Layout](https://www.lucidchart.com/publicSegments/view/a8a95f91-de31-42cb-a33a-26f797cc31ef/image.png)

```js
async function deployStage1(options) {
```
Verify that the bootstrap deployment hasn't already been done
```js
  console.log('Checking for bootstrap transaction presence...');
  const codeAtAddr = await web3.eth.getCode(options.stage1.to);

  if(codeAtAddr === '0x' || codeAtAddr === '0x0') {
```
Fund the deployment account
```js
    console.log('Running bootstrap transaction...');
    await web3.eth
      .sendTransaction({
        from: options.account,
        to: options.stage1.from,
        value: web3.utils.toBN(options.stage1.tx.gasLimit).mul(web3.utils.toBN(options.stage1.tx.gasPrice))
      });

```
Issue the pre-signed deployment transaction
```js
    await web3.eth.sendSignedTransaction(options.stage1.raw);
  }
  else {
    console.log('Bootstrap stage already deployed');
  }

  if(!options.fanoutTree) {
    console.log('Deploying fanout-tree library...');
    const fanoutTree = await (new web3.eth.Contract(FanoutTreeABI.abi)
                              .deploy({
                                data: FanoutTreeABI.bytecode
                              })
                              .send({
                                from: options.account,
                                gas: 1000000,
                                gasPrice: GAS_PRICE
                              }));
    options.fanoutTree = fanoutTree.options.address;
  }

  return options;
}

```
### Stage 2
Once the initial proxy addresses are allocated we begin replacing the proxy
targets of select addresses to construct the policy structure. Policy targets
are always configured by a `PolicyInit` contract, so we deploy one and use
the `EcoInitializable` at the 0th reserved address to redirect the address
to the new `PolicyInit` instance.

![Step 1 of Policy Setup](https://www.lucidchart.com/publicSegments/view/ddd05c82-5b4b-4742-9f37-666ffd318261/image.png)

```js
async function deployStage2(options) {
  console.log(`Bootstrap contract address: ${options.stage1.to}`);
```
Lookup proxy addresses
```js
  const policyProxyAddress = await options.bootstrap
        .methods['deployed'](web3.utils.toBN(0))
        .call({from: options.account});
  const balanceStoreProxyAddress = await options.bootstrap
        .methods['deployed'](web3.utils.toBN(1))
        .call({
          from: options.account
        });
  const erc20ProxyAddress = await options.bootstrap
        .methods['deployed'](web3.utils.toBN(2))
        .call({
          from: options.account
        });
  const erc777ProxyAddress = await options.bootstrap
        .methods['deployed'](web3.utils.toBN(3))
        .call({
          from: options.account
        });

  const ecoInitPolicyProxy = new web3.eth.Contract(EcoInitializableABI.abi,
                                                    policyProxyAddress);

  console.log('deploying policy initialization contract...');
  const policyInit = await new web3.eth.Contract(PolicyInitABI.abi)
        .deploy({
          data: PolicyInitABI.bytecode
        })
        .send({
          from: options.account,
          gas: 665982,
          gasPrice: GAS_PRICE
        });

  console.log('binding proxy 0 to policy initialization contract...',
              policyProxyAddress, ecoInitPolicyProxy.options.address, policyInit.options.address);
  await ecoInitPolicyProxy
    .methods['setImplementation(address)'](policyInit.options.address)
    .send({
      from: options.account,
      gas: 3000000,
      gasPrice: GAS_PRICE
    });
  options.policyProxy = new web3.eth.Contract(PolicyABI.abi, policyProxyAddress);

```
Deploy the balance store contract

![Deploy the Balance Store](https://www.lucidchart.com/publicSegments/view/51ba5fa7-24d5-4bdd-a3c5-bc580fb5369a/image.png)
```js
  console.log('deploying balance store...');
  const balanceStoreImpl = await (new web3.eth.Contract(EcoBalanceStoreABI.abi)
                                  .deploy({
                                    data: EcoBalanceStoreABI.bytecode,
                                    arguments: [ options.policyProxy.options.address ]
                                  })
                                  .send({
                                    from: options.account,
                                    gas: 3000000,
                                    gasPrice: GAS_PRICE
                                  }));
  console.log('binding proxy 1 to the balance store implementation contract...');
  await new web3.eth.Contract(EcoInitializableABI.abi, balanceStoreProxyAddress)
    .methods['setImplementation(address)'](balanceStoreImpl.options.address)
    .send({
      from: options.account,
      gas: 500000,
      gasPrice: GAS_PRICE
    });
  options.balanceStoreImpl = balanceStoreImpl;
  options.balanceStore = new web3.eth.Contract(EcoBalanceStoreABI.abi, balanceStoreProxyAddress);

```
Deploy the implementation contracts
![Deploy the Token Interfaces](https://www.lucidchart.com/publicSegments/view/b528bda8-df21-49fd-8d8e-2e05a8875f58/image.png)
```js
  console.log('deploying the ERC20 implementation contract...');
  const erc20Impl = await (new web3.eth.Contract(ERC20EcoTokenABI.abi)
                           .deploy({
                             data: ERC20EcoTokenABI.bytecode,
                             arguments: [ options.policyProxy.options.address ]
                           })
                           .send({
                             from: options.account,
                             gas: 5000000,
                             gasPrice: GAS_PRICE
                           }));
  console.log('deploying the ERC777 implementation contract...');
  const erc777Impl = await (new web3.eth.Contract(ERC777EcoTokenABI.abi)
                            .deploy({
                              data: ERC777EcoTokenABI.bytecode,
                              arguments: [ options.policyProxy.options.address ]
                            })
                            .send({
                              from: options.account,
                              gas: 5000000,
                              gasPrice: GAS_PRICE
                            }));

```
Update the proxy targets to the implementation contract addresses
```js
  console.log('binding proxy 2 to the ERC20 implementation contract...');
  await new web3.eth.Contract(EcoInitializableABI.abi, erc20ProxyAddress)
    .methods['setImplementation(address)'](erc20Impl.options.address)
    .send({
      from: options.account,
      gas: 500000,
      gasPrice: GAS_PRICE
    });
  console.log('binding proxy 3 to the ERC777 implementation contract...');
  await new web3.eth.Contract(EcoInitializableABI.abi, erc777ProxyAddress)
    .methods['setImplementation(address)'](erc777Impl.options.address)
    .send({
      from: options.account,
      gas: 500000,
      gasPrice: GAS_PRICE
    });

```
Pass along the local token contract objects
```js
  options.erc20 = new web3.eth.Contract(ERC20EcoTokenABI.abi,
                                        erc20ProxyAddress);
  options.erc777 = new web3.eth.Contract(ERC777EcoTokenABI.abi,
                                         erc777ProxyAddress);

  return options;
}

```
### Stage 3
Constructing the policy set is the most complicated step of the deployment
process. We use one policy contract to manage the policy and inflation voting
process (`TimedPolicies`), another for minting initial tokens and authorizing
the basic inteerfaces (`EcoTokenInit`), and, in test environments, a third
for tearing down contrats we're done with (`EcoTestCleanup`).

We also register the ERC1820 interfaces for our ERC20 token proxy and our
ERC777 token proxy.

![Step 2 of Policy Setup](https://www.lucidchart.com/publicSegments/view/0fb82096-b78b-4303-b575-6c424847f9fe/image.png)

```js
async function deployStage3(options) {
```
Collect up the identifiers and addresses to be used in the policy structure
```js
  const setters = [];
  const identifiers = [];
  const addresses = [];

```
Deploy the voting policy contract
```js
  console.log('deploying the voting policy contract...');
  const votingPolicy = await (new web3.eth.Contract(TimedPoliciesABI.abi)
                              .deploy({
                                data: linker.linkBytecode(TimedPoliciesABI.bytecode, {
                                  FanOutTree: options.fanoutTree
                                }),
                                arguments: [ options.policyProxy.options.address ]
                              })
                              .send({
                                from: options.account,
                                gas: 6400000,
                                gasPrice: GAS_PRICE
                              }));
  identifiers.push(web3.utils.soliditySha3('Voting'));
  setters.push(web3.utils.soliditySha3('Voting'));
  addresses.push(votingPolicy.options.address);
  options.votingPolicy = votingPolicy;

```
Deploy the policy implementatiaon contract
```js
  console.log('deploying the policy implementation contract...');
  const policyContract = await (new web3.eth.Contract(PolicyABI.abi)
                                .deploy({
                                  data: PolicyABI.bytecode
                                })
                                .send({
                                  from: options.account,
                                  gas: 500000,
                                  gasPrice: GAS_PRICE
                                }));
  options.policyContract = policyContract;

```
Deploy the voting bond contract
```js
  console.log('deploying the bonds contract...');
  const bondContract = await (new web3.eth.Contract(SharedBondABI.abi)
                              .deploy({
                                data: SharedBondABI.bytecode
                              })
                              .send({
                                from: options.account,
                                gas: 3000000,
                                gasPrice: GAS_PRICE
                              }));
  options.bondContract = bondContract;
  identifiers.push(web3.utils.soliditySha3('SharedBond'));
  addresses.push(bondContract.options.address);

```
Deploy the currency initialization contract
```js
  console.log('deploying the token initialization policy contract...');
  const initContract = await (new web3.eth.Contract(EcoTokenInitABI.abi)
                              .deploy({
                                data: EcoTokenInitABI.bytecode,
                                arguments: [
                                  options.policyProxy.options.address
                                ]
                              })
                              .send({
                                from: options.account,
                                gas: 3000000,
                                gasPrice: GAS_PRICE
                              }));
  options.initContract = initContract;
  identifiers.push(web3.utils.soliditySha3('Inflation'));
  addresses.push(initContract.options.address);

```
If this is not going to production, deploy the cleanup contract and the faucet
```js
  if(!options.production) {
    console.log('deploying the cleanup policy contract...');
    const cleanupContract = await (new web3.eth.Contract(EcoTestCleanupABI.abi)
                                   .deploy({
                                     data: EcoTestCleanupABI.bytecode,
                                     arguments: [ options.policyProxy.options.address ]
                                   })
                                   .send({
                                     from: options.account,
                                     gas: 750000,
                                     gasPrice: GAS_PRICE
                                   }));
    identifiers.push(web3.utils.soliditySha3('Cleanup'));
    setters.push(web3.utils.soliditySha3('Cleanup'));
    addresses.push(cleanupContract.options.address);
    options.cleanupContract = cleanupContract;

    console.log('deploying the faucet policy contract...');
    const faucetContract = await (new web3.eth.Contract(EcoFaucetABI.abi)
                                  .deploy({
                                    data: EcoFaucetABI.bytecode
                                  })
                                  .send({
                                    from: options.account,
                                    gas: 750000,
                                    gasPrice: GAS_PRICE
                                  }));
    identifiers.push(web3.utils.soliditySha3('Faucet'));
    addresses.push(faucetContract.options.address);
    options.faucetContract = faucetContract;
  }

```
Add token interfaces and balance store to the ERC1820 interfaces lists for
our policy initilization action.
```js
  identifiers.push(web3.utils.soliditySha3('ERC20Token'));
  addresses.push(options.erc20.options.address);
  identifiers.push(web3.utils.soliditySha3('ERC777Token'));
  addresses.push(options.erc777.options.address);
  identifiers.push(web3.utils.soliditySha3('BalanceStore'));
  addresses.push(options.balanceStore.options.address);

```
Initialize the policy structure and prevent any futher changes
```js
  console.log('fusing policy initializer...');
  const ecoInitPolicy = new web3.eth.Contract(PolicyInitABI.abi,
                                               options.policyProxy.options.address);

  await ecoInitPolicy.methods['fusedInit'](policyContract.options.address,
                                            setters,
                                            identifiers,
                                            addresses)
    .send({
      from: options.account,
      gas: 5000000,
      gasPrice: GAS_PRICE
    });
  return options;
}

```
### Stage 4
Before wallets can interact with the token interfaces they need to be
authorized to perform actions on the balance store. Our initialization
contract deployed in [Stage 3](#stage-3) will mint some initial tokens.
The initialization contract self-destructs on first use to prevent any
possible future run. The `reAuthorize` operation will cache token
interface authorizations.

![Authorize Token Interfaces](https://www.lucidchart.com/publicSegments/view/8730274f-cb64-4605-b60c-5413723befba/image.png)

```js
async function deployStage4(options) {
  console.log(`minting initial coins using ${options.initContract.options.address} ${options.balanceStore.options.address}...`);
  await options.initContract
    .methods['initializeAndFuse'](options.balanceStore.options.address)
    .send({
      from: options.account,
      gas: 4000000,
      gasPrice: GAS_PRICE
    });
  console.log('recomputing authorized contracts list for balance store...');
  await options.balanceStore
    .methods['reAuthorize']()
    .send({
      from: options.account,
      gas: 400000,
      gasPrice: GAS_PRICE
    });
  return options;
}

```
## Sequencing and Reporting
After the intial setup, each deployment stage is run in sequence and a
a summary is generated showing the addresses of the token interfaces for
convenience.

```js
setup()
  .then(deployStage1)
  .then(deployStage2)
  .then(deployStage3)
  .then(deployStage4)
  .then(async options => {
    console.log('Root:    ', options.bootstrap.options.address);
    console.log('Policy:  ', options.policyProxy.options.address);
    console.log('Store:   ', options.balanceStore.options.address);
    console.log('ERC20:   ', options.erc20.options.address);
    console.log('ERC777:  ', options.erc777.options.address);
    console.log('Voting:  ', options.votingPolicy.options.address);
    if(options.cleanupContract)
      console.log('Cleanup: ', options.cleanupContract.options.address);
    if(options.faucetContract)
      console.log('Faucet:  ', options.faucetContract.options.address);
  });

```
------------------------
Generated _Fri Aug 03 2018 12:01:34 GMT-0700 (PDT)_ from [&#x24C8; index.js](index.js "View in source")

