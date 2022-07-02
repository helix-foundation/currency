module.exports = {
  providerOptions: {
    default_balance_ether: 100000000,
    network_id: 123,
    gasPrice: 0,
    total_accounts: '100'
  },
  skipFiles: ['test/'],
  mocha: {
    grep: "@skip-on-coverage",
    invert: true,
  },
};
