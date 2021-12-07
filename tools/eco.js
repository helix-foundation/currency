#!/usr/bin/env node

/* eslint-disable no-console */

const Web3 = require('web3');

global.web3 = new Web3();

const commandLineArgs = require('command-line-args');
const fs = require('fs');
const path = require('path');
const bip39 = require('bip39');
const { hdkey } = require('ethereumjs-wallet');
const express = require('express');
const ganache = require('ganache-cli');
const { deploy } = require('./deploy');
const { Supervisor } = require('./supervisor');

const defaultRpc = 'ws://localhost:8545';

function reqArtifact(contract) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, `../build/contracts/${contract}.json`)));
}

const PolicedUtilsABI = reqArtifact('PolicedUtils');
const PolicyABI = reqArtifact('Policy');
const EcoFaucetABI = reqArtifact('EcoFaucet');

let options;

// ## Init
// Parse command line
async function parseOptions() {
  const OPT_DEFS = [
    {
      name: 'trustednode',
      type: String,
      multiple: true,
    },
    {
      name: 'ganache',
      type: Boolean,
      defaultValue: false,
    },
    {
      name: 'supervise',
      type: Boolean,
      defaultValue: false,
    },
    {
      name: 'devmode',
      type: Boolean,
      defaultValue: false,
    },
    {
      name: 'selftest',
      type: Boolean,
      defaultValue: false,
    },
    {
      name: 'deploy',
      type: Boolean,
    },
    {
      name: 'from',
      type: String,
    },
    {
      name: 'erc20',
      type: String,
    },
    {
      name: 'webrpc',
      type: String,
    },
  ];
  options = commandLineArgs(OPT_DEFS);

  if ((!options.ganache) === (!options.webrpc)) {
    throw new Error('Must specify exactly one of --ganache and --webrpc');
  }
  if (options.erc20 && !options.supervise) {
    throw new Error('--erc20 makes no sense without --supervise');
  }
  if (options.ganache) {
    if (options.supervise && !options.deploy) {
      throw new Error('For ganache, must specify --deploy when using --supervise');
    }
  } else if (options.supervise) {
    if ((!options.erc20) === (!options.deploy)) {
      throw new Error('For supervise, must specify either --deploy or --erc20');
    }
  }
}

async function initWeb3() {
  if (options.ganache) {
    const serverAddr = '0.0.0.0';
    const serverPort = 8545;
    /* eslint-disable global-require, import/no-extraneous-dependencies */
    options.ganacheServer = ganache.server({ default_balance_ether: 1000000 });
    options.ganacheServer.listen(serverPort, serverAddr, (err) => {
      if (err) {
        console.log(err);
        return;
      }

      console.log(`Ganache server listening on ${serverAddr}:${serverPort}`);
    });
    global.web3 = new Web3(options.ganacheServer.provider);
  } else {
    global.web3 = new Web3(options.webrpc || defaultRpc);
  }

  const sync = await web3.eth.isSyncing();
  if (sync !== false) {
    throw Error(`Node is still synchronizing ${sync.currentBlock}/${sync.highestBlock}`);
  }
}

async function initUsers() {
  let account;

  if (options.from) {
    if (web3.utils.isAddress(options.from)) {
      account = options.from;
    } else {
      let priv;
      if (web3.utils.isHexStrict(options.from)) {
        priv = options.from;
      } else {
        const seed = await bip39.mnemonicToSeed(options.from);
        const hdwallet = hdkey.fromMasterSeed(seed);
        const myWallet = hdwallet.derivePath("m/44'/60'/0'/0/0").getWallet();
        priv = `0x${myWallet.getPrivateKey().toString('hex')}`;
      }
      const a = web3.eth.accounts.privateKeyToAccount(priv);
      web3.eth.accounts.wallet.add(a);
      account = a.address;
    }
  } else {
    [account] = await web3.eth.getAccounts();
  }
  if (!account) {
    // Use fallback account
    const a = web3.eth.accounts.privateKeyToAccount('0x8981f8cbe9a797b9adac0730da85582b2164114e934e2b6aed5de5c785c0b4a6');
    web3.eth.accounts.wallet.add(a);
    account = a.address;
  }

  const balance = web3.utils.fromWei(await web3.eth.getBalance(account), 'ether');
  if (balance < 1) {
    throw Error(`Deployment account (${account}) should have at least 1 Ether, has only ${balance}`);
  }

  // Verify account works
  await web3.eth.sendTransaction({
    from: account,
    to: account,
    gas: 25000,
    value: web3.utils.toWei('1', 'gwei'),
  });

  options.account = account;
}

async function deployEco() {
  if (options.deploy) {
    const trustednodes = [];
    if (options.trustednode) {
      trustednodes.push(...options.trustednode);
    }
    if (options.devmode) {
      trustednodes.unshift(options.account);
      await Promise.all(
        trustednodes.map(
          (a) => web3.eth.sendTransaction(
            { from: options.account, to: a, value: web3.utils.toWei('50', 'ether') },
          ),
        ),
      );
    }
    options.erc20 = await deploy(options.account, trustednodes);

    if (options.devmode) {
      const token = new web3.eth.Contract(PolicedUtilsABI.abi, options.erc20);
      const policy = new web3.eth.Contract(PolicyABI.abi, await token.methods.policy().call());
      const faucetaddr = await policy.methods.policyFor(web3.utils.soliditySha3('Faucet')).call();
      const faucet = new web3.eth.Contract(EcoFaucetABI.abi, faucetaddr);

      const mintAmount = web3.utils.toWei('500000', 'ether');
      await faucet.methods.mint().send(
        options.account,
        mintAmount,
        { from: options.account, gas: 1000000 },
      );
    }
    console.log(`ERC20 at ${options.erc20}`);
  }
}

async function findPolicy() {
  if (options.erc20) {
    const root = new web3.eth.Contract(PolicedUtilsABI.abi, options.erc20);
    options.policy = await root.methods.policy().call();
    console.log(`Policy at ${options.policy}`);
  }
}

async function startExpress() {
  if (options.devmode && options.policy) {
    const app = express();
    app.get('/', (req, res) => res.send(options.policy));
    options.expressServer = app.listen(8548);
  }
}

async function supervise() {
  if (options.supervise) {
    if (options.selftest) {
      const supervisor = new Supervisor(options.policy, options.account);
      await supervisor.processAllBlocks();
    } else {
      await Supervisor.start({
        root: options.policy,
      });
    }
  }
}

async function closeTest() {
  if (options.selftest) {
    if (web3.currentProvider.connection) {
      await web3.currentProvider.connection.close();
    }
    if (options.expressServer) {
      await options.expressServer.close();
    }
    if (options.ganacheServer) {
      await options.ganacheServer.close();
    }
  }
}

(async () => {
  try {
    await parseOptions();
    await initWeb3();
    await initUsers();
    await deployEco();
    await findPolicy();
    await startExpress();
    await supervise();
    await closeTest();
  } catch (e) {
    console.log(e.toString(), e);
  }
})();
