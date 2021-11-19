const chai = require('chai');

const {
  BN,
} = web3.utils;
const bnChai = require('bn-chai');

const {
  expect,
} = chai;

const util = require('../../tools/test/util');

chai.use(bnChai(BN));

contract('ECOx', ([alice, bob, charlie]) => {
  let token;
  let ecox;
  let faucet;

  beforeEach('global setup', async () => {
    ({
      token,
      ecox,
      faucet,
    } = await util.deployPolicy({ trustees: [alice, bob, charlie] }));

    await faucet.mint(alice, new BN('20000000000000000000000'));
    await faucet.mint(bob, new BN('30000000000000000000000'));
    await faucet.mint(charlie, new BN('50000000000000000000000'));

    await faucet.mintx(alice, new BN('500000000000000000000'));
    await faucet.mintx(bob, new BN('300000000000000000000'));
    await faucet.mintx(charlie, new BN('200000000000000000000'));
  });

  it('Verifies starting conditions', async () => {
    expect(await token.totalSupply()).to.eq.BN('100000000000000000000000');
    expect(await ecox.totalSupply()).to.eq.BN('1000000000000000000000');
  });

  it('checks the gas cost of converting', async () => {
    const gas = await ecox.exchange.estimateGas(new BN('100000000000000000000'), { from: alice });
    // eslint-disable-next-line no-console
    console.log(`Conversion costs: ${gas} gas`);
  });

  it('exchanges ECOx', async () => {
    await ecox.exchange(new BN('100000000000000000000'), { from: alice });
    expect(await ecox.balanceOf(alice)).to.eq.BN('400000000000000000000');
    // compare to exact value, truncated
    expect(await token.balanceOf(alice)).to.eq.BN('30517091807564762481170');
  });

  it('exchanges a lot of ECOx', async () => {
    await ecox.exchange(new BN('500000000000000000000'), { from: alice });
    expect(await ecox.balanceOf(alice)).to.eq.BN('0');
    // compare to exact value, truncated
    expect(await token.balanceOf(alice)).to.eq.BN('84872127070012814684865');
  });

  it('exchanges a small amount of ECOx', async () => {
    await ecox.exchange(new BN('1500000'), { from: alice });
    expect(await ecox.balanceOf(alice)).to.eq.BN('499999999999998500000');
    // compare to exact value, truncated
    expect(await token.balanceOf(alice)).to.eq.BN('20000000000000150000000');
    // THIS IS THE APPROXIMATE MINIMUM ACCURATE EXCHANGEABLE PERCENTAGE VALUE
    // BELOW THIS AMOUNT, THE USER MAY BE SHORTCHANGED 1 OF THE SMALLEST UNIT
    // OF ECO DUE TO ROUNDING/TRUNCATING ERRORS
  });
});
