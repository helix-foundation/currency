const chai = require('chai');

const {
  BN,
} = web3.utils;
const bnChai = require('bn-chai');

const {
  expect,
} = chai;

const { constants, expectRevert } = require('@openzeppelin/test-helpers');
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

  context('token burn', () => {
    it('burns tokens sent to Zero address using transfer', async () => {
      await ecox.transfer(constants.ZERO_ADDRESS, new BN('300000000000000000000'), { from: alice });
      expect(await ecox.balanceOf(alice)).to.eq.BN('200000000000000000000');
    });

    it('burns tokens sent to Zero address using transferFrom', async () => {
      await ecox.approve(bob, new BN('300000000000000000000'), { from: alice });
      await ecox.transferFrom(alice, constants.ZERO_ADDRESS, new BN('300000000000000000000'), { from: bob });
      expect(await ecox.balanceOf(alice)).to.eq.BN('200000000000000000000');
    });
  });

  context('allowance', () => {
    it('returns the correct allowance', async () => {
      await ecox.approve(bob, new BN('300000000000000000000'), { from: alice });
      await ecox.approve(bob, new BN('100000000000000000000'), { from: alice });
      expect(await ecox.allowances(alice, bob)).to.eq.BN('100000000000000000000');
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

  context('destruct works properly', () => {
    it('reverts when called by non-ID_CLEANUP address', async () => {
      await expectRevert(
        ecox.destruct({ from: alice }),
        'Only the cleanup policy contract can call destruct',
      );
    });

    it('successfully destructs when called by ID_CLEANUP', async () => {
      // TODO
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
