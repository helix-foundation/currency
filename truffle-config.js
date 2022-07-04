module.exports = {
  plugins: ["solidity-coverage"],
  networks: {
    geth: {
      host: '127.0.0.1',
      port: 8545,
      network_id: '*',
      websockets: false,
    },
    rinkeby: {
      host: 'localhost',
      port: 8545,
      network_id: '4',
      gas: 6712390,
    },
    develop: {
      host: '127.0.0.1',
      port: 8545,
      network_id: 20,
      accounts: 100,
      defaultEtherBalance: 100,
    },
    test: {
      host: '127.0.0.1',
      port: 8545,
      network_id: 5777,
      accounts: 10,
      defaultEtherBalance: 100,
    },
  },
  mocha: {
    enableTimeouts: false,
    grep: process.env.MOCHA_GREP ? new RegExp(process.env.MOCHA_GREP) : new RegExp(),
    invert: process.env.MOCHA_INVERT,
  },
  compilers: {
    solc: {
      version: '0.8.9',
      settings: {
        optimizer: {
          enabled: true,
          runs: 500,
        },
      },
    },
  },
};
