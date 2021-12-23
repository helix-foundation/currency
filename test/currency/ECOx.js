const chai = require('chai');

const {
  BN,
} = web3.utils;
const bnChai = require('bn-chai');

const {
  expect,
} = chai;

const { expectRevert } = require('@openzeppelin/test-helpers');
const util = require('../../tools/test/util');

chai.use(bnChai(BN));

contract('ECOx', (accounts) => {
  let token;
  let ecox;
  let faucet;
  const alice = accounts[0];
  const bob = accounts[1];
  const charlie = accounts[2];
  let counter = 0;

  beforeEach('global setup', async () => {
    ({
      token,
      ecox,
      faucet,
    } = await util.deployPolicy(accounts[counter], { trustees: [alice, bob, charlie] }));
    counter += 1;

    await faucet.mint(alice, new BN('20000000000000000000000'));
    await faucet.mint(bob, new BN('30000000000000000000000'));
    await faucet.mint(charlie, new BN('50000000000000000000000'));

    await faucet.mintx(alice, new BN('500000000000000000000'));
    await faucet.mintx(bob, new BN('300000000000000000000'));
    await faucet.mintx(charlie, new BN('200000000000000000000'));
  });

  it('Verifies starting conditions', async () => {
    // console.log(token);
    // console.log(ecox);
    // console.log(faucet);
    expect(await token.balanceOf(alice)).to.eq.BN('20000000000000000000000');
    expect(await token.balanceOf(bob)).to.eq.BN('30000000000000000000000');
    expect(await token.balanceOf(charlie)).to.eq.BN('50000000000000000000000');

    expect(await ecox.balanceOf(alice)).to.eq.BN('500000000000000000000');
    expect(await ecox.balanceOf(bob)).to.eq.BN('300000000000000000000');
    expect(await ecox.balanceOf(charlie)).to.eq.BN('200000000000000000000');

    expect(await token.totalSupply()).to.eq.BN('100000000000000000000000');
    expect(await ecox.totalSupply()).to.eq.BN('1000000000000000000000');
  });

  it('checks the gas cost of converting', async () => {
    // console.log((await ecox.initialSupply()).toString());
    const gas = await ecox.exchange.estimateGas(new BN('1000'), { from: alice });
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

  context('allowance', () => {
    it('returns the correct allowance', async () => {
      await ecox.approve(bob, new BN('300000000000000000000'), { from: alice });
      await ecox.approve(bob, new BN('100000000000000000000'), { from: alice });
      expect(await ecox.allowance(alice, bob)).to.eq.BN('100000000000000000000');
    });
  });

  context('mint', () => {
    it('mint reverts if called by non-faucet address', async () => {
      await expectRevert(
        ecox.mint(charlie, new BN('50000000000000000000000'), { from: charlie }),
        'Caller not authorized to mint tokens',
      );
    });
  });

  context('getters work properly', () => {
    it('name returns correct name', async () => {
      expect(await ecox.name()).to.equal('Eco-X');
    });

    it('symbol returns correct symbol', async () => {
      expect(await ecox.symbol()).to.equal('ECOx');
    });

    it('decimals returns correct number of decimals', async () => {
      expect(await ecox.decimals()).to.eq.BN('18');
    });

    it('getLockup works properly', async () => {
      // TODO
    });
  });
});
