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
  },
  mocha: {
    grep: process.env.MOCHA_GREP ? new RegExp(process.env.MOCHA_GREP) : new RegExp(),
    invert: process.env.MOCHA_INVERT,
  },
  compilers: {
    solc: {
      version: '0.7.6',
      settings: {
        optimizer: {
          enabled: true,
          runs: 500,
        },
      },
    },
  },
};
