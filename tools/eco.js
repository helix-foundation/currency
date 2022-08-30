/* eslint-disable no-console */
const ethers = require('ethers')
const commandLineArgs = require('command-line-args')
const fs = require('fs')
const path = require('path')
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

async function initEthers() {
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
    options.ethersProvider = new ethers.providers.JsonRpcProvider(
      `http://localhost:${serverPort}`
    )
  } else {
    options.ethersProvider = new ethers.providers.JsonRpcProvider(
      options.webrpc || defaultRpc
    )
  }
}

async function initUsers() {
  let account
  if (!options.production) {
    ;[options.chumpAccount] = await options.ethersProvider.listAccounts()
    options.chumpSigner = await options.ethersProvider.getSigner(options.chumpAccount)
    console.log(`chump account is ${options.chumpAccount}`)
  }

  if (options.from) {
    if (ethers.utils.isAddress(options.from)) {
      account = options.from
      options.signer = await options.ethersProvider.getSigner(account)
    } else {
      if (ethers.utils.isHexString(options.from, 32)) {
        options.signer = new ethers.Wallet(options.from, options.ethersProvider)
      } else {
        options.signer = ethers.Wallet.fromMnemonic(options.from)
      }
      account = await options.signer.getAddress()
    }
  } else {
    account = options.chumpAccount
    options.signer = options.chumpSigner
  }

  const balance = await options.ethersProvider.getBalance(account)

  if (balance < 1) {
    console.log(
      `Deployment account ${account} should have at least 1 Ether, has only ${balance}`
    )
    const chumpBalance = ethers.utils.formatEther(
      await options.ethersProvider.getBalance(options.chumpAccount)
    )
    console.log(
      `funding account from ${options.chumpAccount} which has ${chumpBalance} ether`
    )

    await (
      await options.chumpSigner.sendTransaction({
        to: account,
        value: ethers.utils.parseEther('1000'),
      })
    ).wait()
    const fundedBalance = ethers.utils.formatEther(
      await options.ethersProvider.getBalance(account)
    )
    console.log(
      `Deployment account ${account} now has balance ${fundedBalance}`
    )
  }

  // Verify account works
  await options.signer.sendTransaction({
    to: account,
    value: ethers.utils.parseUnits('1', 'gwei'),
  })

  options.account = account
  console.log(`using account ${options.account} for deployment`)
}

async function deployEco() {
  if (options.deployTokens) {
    options = await deployTokens(options)
    const printOptions = options
    delete printOptions.correctPolicyABI
    delete printOptions.ganacheServer
    delete printOptions.ethersProvider
    delete printOptions.signer
    console.log(JSON.stringify(printOptions, null, 2))
  }
  if (options.deployGovernance) {
    options = await deployGovernance(options)
  }
  console.log(`ECO token at ${options.eco.options.address}`)
  console.log(`ECOx token at ${options.ecox.options.address}`)
  console.log(`Policy at ${options.policyProxyAddress}`)
}

async function supervise() {
  if (options.supervise) {
    console.log('storing supervisor inputs')
    const content = `${options.webrpc ? options.webrpc : defaultRpc}\n${
      options.policyProxyAddress
    }`
    fs.writeFile('tools/supervisorInputs.txt', content, (e) => {
      if (e) {
        console.log(e)
      }
    })
  }
}

;(async () => {
  try {
    await parseOptions()
    await initEthers()
    await initUsers()
    await deployEco()
    await supervise()
  } catch (e) {
    console.log(e.toString(), e)
  }
})()
