const { assert } = require('chai');

const EcoBootstrap = artifacts.require('EcoBootstrap');

const Nick = require('../../tools/nicks');
const { isCoverage } = require('../../tools/test/coverage');

contract('Nick\'s method [@group=2]', async (accounts) => {
  it('deploys', async () => {
    const gasFactor = (await isCoverage()) ? 1000 : 1;
    const nick = Nick.decorateTx(
      Nick.generateTx(
        EcoBootstrap.bytecode,
        web3.utils.randomHex(16),
        5000000 * gasFactor,
        100000000000 / gasFactor,
        web3.eth.abi.encodeParameter('address', accounts[2]),
      ),
    );

    assert((await web3.eth.getCode(nick.to)).length < 10);

    await web3.eth.sendTransaction(
      { from: accounts[0], to: nick.from, value: '500000000000000000' },
    );
    await web3.eth.sendSignedTransaction(nick.raw);

    assert.equal(
      await web3.eth.getCode(nick.to),
      EcoBootstrap.deployedBytecode,
    );
  });
});
