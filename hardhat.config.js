require("@nomiclabs/hardhat-waffle");
require("hardhat-gas-reporter");
require("solidity-coverage");
require("@nomiclabs/hardhat-truffle5");

const { resolve } = require("path");

const { config: dotenvConfig } = require("dotenv");

dotenvConfig({ path: resolve(__dirname, "./.env") });

const chainIds = {
  ganache: 1337,
  goerli: 5,
  hardhat: 31337,
  kovan: 42,
  mainnet: 1,
  rinkeby: 4,
  ropsten: 3,
};

// Ensure that we have all the environment variables we need.
let mnemonic;
if (!process.env.MNEMONIC) {
  mnemonic = "test test test test test test test test test test test junk";
} else {
  mnemonic = process.env.MNEMONIC;
}

let infuraApiKey;
if (!process.env.INFURA_API_KEY) {
  infuraApiKey = "test";
} else {
  infuraApiKey = process.env.INFURA_API_KEY;
}

function createTestnetConfig(network) {
  const url = "https://" + network + ".infura.io/v3/" + infuraApiKey;
  return {
    accounts: {
      count: 20,
      initialIndex: 0,
      mnemonic,
      path: "m/44'/60'/0'/0",
    },
    chainId: chainIds[network],
    url,
  };
}

module.exports = {
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  defaultNetwork: "hardhat",
  gasReporter: {
    currency: "USD",
    enabled: process.env.REPORT_GAS ? true : false,
    excludeContracts: [],
    src: "./contracts",
  },
  networks: {
    hardhat: {
      accounts: {
        count: 100,
        mnemonic,
      },
      chainId: chainIds.hardhat,
    },
    goerli: createTestnetConfig("goerli"),
    kovan: createTestnetConfig("kovan"),
    rinkeby: createTestnetConfig("rinkeby"),
    ropsten: createTestnetConfig("ropsten"),
    mainnet: createTestnetConfig("mainnet"),
  },
  paths: {
    artifacts: "./artifacts",
    cache: "./cache",
    sources: "./contracts",
    tests: "./test",
  },
  solidity: {
    compilers: [
      {
        version: "0.8.9",
        settings: {
          metadata: {
            // Not including the metadata hash
            // https://github.com/paulrberg/solidity-template/issues/31
            bytecodeHash: "none",
          },
          // You should disable the optimizer when debugging
          // https://hardhat.org/hardhat-network/#solidity-optimizer-support
          optimizer: {
            enabled: true,
            runs: 999999,
          },
        },
      },
    ],
  },
  mocha: {
    enableTimeouts: false,
    grep: process.env.MOCHA_GREP ? new RegExp(process.env.MOCHA_GREP) : new RegExp(),
    invert: process.env.MOCHA_INVERT,
  },
};
