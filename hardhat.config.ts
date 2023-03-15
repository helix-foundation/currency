import * as dotenv from "dotenv"

import { HardhatUserConfig, task } from "hardhat/config"
import "@nomicfoundation/hardhat-chai-matchers"
import "@nomiclabs/hardhat-ethers"
import "@typechain/hardhat"
import "hardhat-gas-reporter"
import "solidity-coverage"
import "@nomiclabs/hardhat-etherscan"

dotenv.config()

enum NetworkID {
  ganache = 1337,
  goerli = 5,
  hardhat = 31337,
  kovan = 42,
  mainnet = 1,
  rinkeby = 4,
  ropsten = 3
}

// Ensure that all the environment variables are present.
let mnemonic: string;
if (!process.env.MNEMONIC) {
  mnemonic = "test test test test test test test test test test test junk";
} else {
  mnemonic = process.env.MNEMONIC;
}

let infuraApiKey: string;
if (!process.env.INFURA_API_KEY) {
  infuraApiKey = "test";
} else {
  infuraApiKey = process.env.INFURA_API_KEY;
}

function createTestnetConfig(networkID: NetworkID) {
  const url = "https://" + NetworkID[networkID] + ".infura.io/v3/" + infuraApiKey;
  return {
    accounts: {
      count: 100,
      mnemonic,
    },
    chainId: networkID,
    url
  }
}
const config: HardhatUserConfig = {
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
      chainId: NetworkID.hardhat,
    },
    goerli: {
      url: "INFURA_URL"
    },
    kovan: createTestnetConfig(NetworkID.kovan),
    rinkeby: createTestnetConfig(NetworkID.rinkeby),
    ropsten: createTestnetConfig(NetworkID.ropsten),
    mainnet: {
      url: "INFURA_URL"
    },
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
    //@ts-ignore
    grep: process.env.MOCHA_GREP ? new RegExp(process.env.MOCHA_GREP) : new RegExp(),
    //@ts-ignore
    invert: process.env.MOCHA_INVERT,
    timeout: 60000,
  },
  etherscan: {
    apiKey: "ETHERSCAN_API_KEY"
  },
};

export default config
