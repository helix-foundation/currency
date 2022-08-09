/* eslint-disable no-console */

const Web3 = require('web3')
const ethers = require('ethers')

global.web3 = new Web3()
let ethersProvider

const commandLineArgs = require('command-line-args')
const fs = require('fs')
const path = require('path')
const bip39 = require('bip39')
const { hdkey } = require('ethereumjs-wallet')
const express = require('express')
const ganache = require('ganache-cli')
const { deployTokens, deployGovernance } = require('./deploy')

const defaultRpc = 'http://localhost:8545'

function loadConfig(fileNamePath) {
  let stem = ''
  if (fileNamePath[0] !== '/') {
    stem = '../'
  }
  return JSON.parse(
    fs.readFileSync(path.resolve(__dirname, `${stem}${fileNamePath}`))
  )
}

const ECOABI = require('../artifacts/contracts/currency/ECO.sol/ECO.json')
const PolicyABI = require('../artifacts/contracts/policy/Policy.sol/Policy.json')
const EcoFaucetABI = require('../artifacts/contracts/deploy/EcoFaucet.sol/EcoFaucet.json')

let options

// ## Init
// Parse command line
async function parseOptions() {
  const OPT_DEFS = [
    {
      name: 'config',
      type: String,
    },
    {
      name: 'trustednodes',
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
      name: 'deployTokens',
      type: Boolean,
      defaultValue: false,
    },
    {
      name: 'initialECOString',
      type: String,
    },
    {
      name: 'initialECOxString',
      type: String,
    },
    {
      name: 'deployGovernance',
      type: Boolean,
      defaultValue: false,
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
  ]
  options = commandLineArgs(OPT_DEFS)

  if (options.initialECOString) {
    options.initialECO = JSON.parse(options.initialECOString)
  }

  if (options.initialECOxString) {
    options.initialECOx = JSON.parse(options.initialECOxString)
  }

  if (options.config) {
    const s = options.supervise
    options = loadConfig(options.config)
    options.supervise = s || options.supervise
    console.log('loaded config from file, CLI options not used')
  }

  if (!options.ganache === !options.webrpc) {
    throw new Error('Must specify exactly one of --ganache and --webrpc')
  }
}

async function initWeb3() {
  if (options.ganache) {
    const serverAddr = '0.0.0.0'
    let serverPort
    if (options.deployTokens) {
      serverPort = 8545
      options.ganacheServer = ganache.server({
        default_balance_ether: 1000000,
        blockTime: 0.1,
      })
    } else if (options.deployGovernance) {
      serverPort = 8546
      options.ganacheServer = ganache.server({
        default_balance_ether: 1000000,
        blockTime: 0.1,
        fork: `${serverAddr}:${serverPort - 1}`,
      })
    }
    /* eslint-disable global-require, import/no-extraneous-dependencies */
    options.ganacheServer.listen(serverPort, serverAddr, (err) => {
      if (err) {
        console.log(err)
        return
      }

      console.log(`Ganache server listening on ${serverAddr}:${serverPort}`)
    })
    global.web3 = new Web3(options.ganacheServer.provider)
    ethersProvider = new ethers.providers.JsonRpcProvider(defaultRpc)
  } else {
    ethersProvider = new ethers.providers.JsonRpcProvider(
      options.webrpc || defaultRpc
    )
  }

  const sync = await web3.eth.isSyncing()
  if (sync !== false) {
    throw Error(
      `Node is still synchronizing ${sync.currentBlock}/${sync.highestBlock}`
    )
  }
}

async function initUsers() {
  let account
  let chumpAccount
  if (!options.production) {
    ;[chumpAccount] = await ethersProvider.listAccounts()
    options.chumpAccount = chumpAccount
    console.log(`chump account is ${options.chumpAccount}`)

    options.signer = await ethersProvider.getSigner()
  }

  if (options.from) {
    if (web3.utils.isAddress(options.from)) {
      account = options.from
    } else {
      let priv
      if (web3.utils.isHexStrict(options.from)) {
        priv = options.from
      } else {
        const seed = await bip39.mnemonicToSeed(options.from)
        const hdwallet = hdkey.fromMasterSeed(seed)
        const myWallet = hdwallet.derivePath("m/44'/60'/0'/0/0").getWallet()
        priv = `0x${myWallet.getPrivateKey().toString('hex')}`
      }
      const a = web3.eth.accounts.privateKeyToAccount(priv)
      web3.eth.accounts.wallet.add(a)
      account = a.address
    }
  } else {
    account = chumpAccount
  }
  if (!account) {
    // Use fallback account
    const a = web3.eth.accounts.privateKeyToAccount(
      '0x8981f8cbe9a797b9adac0730da85582b2164114e934e2b6aed5de5c785c0b4a6'
    )
    web3.eth.accounts.wallet.add(a)
    account = a.address
  }

  // const balance = web3.utils.fromWei(await web3.eth.getBalance(account), 'ether');
  const balance = await ethersProvider.getBalance(account)

  if (balance < 1) {
    console.log(
      `Deployment account ${account} should have at least 1 Ether, has only ${balance}`
    )
    const chumpBalance = web3.utils.fromWei(
      await web3.eth.getBalance(chumpAccount),
      'ether'
    )
    console.log(
      `funding account from ${chumpAccount} which has ${chumpBalance} ether`
    )
    await web3.eth.sendTransaction({
      from: chumpAccount,
      to: account,
      gas: 25000,
      value: web3.utils.toWei('1000', 'ether'),
    })
    const fundedBalance = web3.utils.fromWei(
      await web3.eth.getBalance(account),
      'ether'
    )
    console.log(
      `Deployment account ${account} now has balance ${fundedBalance}`
    )
  }

  // Verify account works
  await web3.eth.sendTransaction({
    from: account,
    to: account,
    gas: 25000,
    value: web3.utils.toWei('1', 'gwei'),
  })

  console.log(`using account ${account} for deployment`)
  options.account = account
}

async function deployEco() {
  if (options.devmode && options.trustednodes) {
    const trustednodes = []
    trustednodes.push(...options.trustednodes)
    trustednodes.unshift(options.account)
    await Promise.all(
      trustednodes.map((a) =>
        web3.eth.sendTransaction({
          from: options.account,
          to: a,
          value: web3.utils.toWei('50', 'ether'),
        })
      )
    )
  }
  if (options.deployTokens) {
    options = await deployTokens(options)
    const printOptions = options
    delete printOptions.correctPolicyABI
    delete printOptions.ganacheServer
    console.log(JSON.stringify(printOptions, null, 2))
  }
  if (options.deployGovernance) {
    options = await deployGovernance(options)

    if (options.devmode) {
      const eco = new web3.eth.Contract(ECOABI.abi, options.eco)
      const policy = new web3.eth.Contract(
        PolicyABI.abi,
        await eco.methods.policy().call()
      )
      const faucetaddr = await policy.methods
        .policyFor(web3.utils.soliditySha3('Faucet'))
        .call()
      const faucet = new web3.eth.Contract(EcoFaucetABI.abi, faucetaddr)

      const mintAmount = web3.utils.toWei('500000', 'ether')
      await faucet.methods
        .mint(options.account, mintAmount)
        .send({ from: options.account, gas: 1000000 })
    }
  }
  console.log(`ECO token at ${options.eco.options.address}`)
  console.log(`ECOx token at ${options.ecox.options.address}`)
}

async function findPolicy() {
  if (options.eco && options.deployGovernance) {
    const root = new web3.eth.Contract(ECOABI.abi, options.eco.options.address)
    options.policy = await root.methods.policy().call()
    console.log(`Policy at ${options.policy}`)
  }
}

async function startExpress() {
  if (options.devmode && options.policy) {
    const app = express()
    app.get('/', (req, res) => res.send(options.policy))
    options.expressServer = app.listen(8548)
  }
}

async function supervise() {
  if (options.supervise) {
    if (options.selftest) {
      // const supervisor = new Supervisor(defaultRpc, options.policy);
      // await supervisor.processAllBlocks();
    } else {
      console.log('storing supervisor inputs')
      const content = `${defaultRpc}\n${options.policy}`
      fs.writeFile('tools/supervisorInputs.txt', content, (e) => {
        if (e) {
          console.log(e)
        }
      })
      // await Supervisor.start(
      //   defaultRpc,
      //   options.policy,
      // );
    }
  }
}

async function closeTest() {
  if (options.selftest) {
    if (web3.currentProvider.connection) {
      await web3.currentProvider.connection.close()
    }
    if (options.expressServer) {
      await options.expressServer.close()
    }
    if (options.ganacheServer) {
      await options.ganacheServer.close()
    }
  }
}

;(async () => {
  try {
    await parseOptions()
    await initWeb3()
    await initUsers()
    await deployEco()
    await findPolicy()
    await startExpress()
    await supervise()
    await closeTest()
  } catch (e) {
    console.log(e.toString(), e)
  }
})()
