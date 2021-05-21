/* eslint-disable no-underscore-dangle, no-param-reassign, no-console */

const { isCoverage } = require('../tools/test/coverage.js');

before(async () => {
  if (!await isCoverage()) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log('WARNING: Coverage mode, test assertions disabled!');

  Object.entries(assert).forEach((a) => {
    if (typeof a[1] === 'function') {
      assert[a[0]] = () => {};
    }
  });

  console.log('WARNING: Overriding gas estimates for web3.eth.Contract');

  const block = await web3.eth.getBlock('latest');
  const limit = block.gasLimit;
  const o = web3.eth.Contract.prototype._getOrSetDefaultOptions;
  web3.eth.Contract.prototype._getOrSetDefaultOptions = function getOrSetDefaultOptions(options) {
    options.gas = limit;
    return o.call(this, options);
  };
});
