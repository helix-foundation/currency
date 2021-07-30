const CurrencyGovernance = artifacts.require('CurrencyGovernance');
const Lockup = artifacts.require('Lockup');

const chai = require('chai');

const {
  BN,
  toBN,
} = web3.utils;
const bnChai = require('bn-chai');

const {
  expect,
} = chai;

const {
  time,
} = require('@openzeppelin/test-helpers');

const util = require('../../tools/test/util.js');

chai.use(bnChai(BN));

contract('ECOx', ([alice, bob, charlie]) => {
  let policy;
  let timedPolicies;
  let token;
  let ecox;
  let faucet;
  let currencyTimer;

  beforeEach('global setup', async () => {
    ({
      policy,
      token,
      ecox,
      faucet,
      currencyTimer,
      timedPolicies,
    } = await util.deployPolicy({ trustees: [alice, bob, charlie] }));

    await faucet.mint(alice, new BN('20000'));
    await faucet.mint(bob, new BN('30000'));
    await faucet.mint(charlie, new BN('50000'));

    await faucet.mintx(alice, new BN('500'));
    await faucet.mintx(bob, new BN('300'));
    await faucet.mintx(charlie, new BN('200'));
  });

  it('Verifies starting conditions', async () => {
    expect(await token.totalSupply()).to.eq.BN('100000');
    expect(await ecox.totalSupply()).to.eq.BN('1000');
  });

  it('exchanges ECOx', async () => {
    await ecox.exchange(new BN('100'), { from: alice });
    expect(await ecox.balanceOf(alice)).to.eq.BN('400');
    // Original 20k + 1/10th of ECOx 'value', which should be 1/10th of 50% of 100k, or 5000
    expect(await token.balanceOf(alice)).to.eq.BN('25000');
  });

  it('exchanges ECOx twice', async () => {
    await ecox.exchange(new BN('100'), { from: alice });
    await ecox.exchange(new BN('100'), { from: alice });
    expect(await ecox.balanceOf(alice)).to.eq.BN('300');

    // Tests that the ECOx-induced ECO doesn't influence the exchange rate
    expect(await token.balanceOf(alice)).to.eq.BN('30000');
  });

  context('With a lockup contract', async () => {
    let borda;
    let lockup;

    beforeEach('lockup', async () => {
      const hash = (x) => web3.utils.soliditySha3(
        { type: 'bytes32', value: x[0] },
        { type: 'address', value: x[1] },
        { type: 'address', value: x[2] },
      );

      borda = await CurrencyGovernance.at(
        await util.policyFor(policy, await timedPolicies.ID_CURRENCY_GOVERNANCE()),
      );

      await borda.propose(0, 0, 30, 40, toBN('1000000000000000000'), { from: bob });
      await time.increase(3600 * 24 * 10.1);

      const bobvote = [web3.utils.randomHex(32), bob, [bob]];
      await borda.commit(hash(bobvote), { from: bob });
      await time.increase(3600 * 24 * 3);
      await borda.reveal(bobvote[0], bobvote[2], { from: bob });
      await time.increase(3600 * 24 * 1);
      await borda.updateStage();
      await borda.compute();
      await time.increase(3600 * 24 * 3);
      await timedPolicies.incrementGeneration();

      const [evt] = await currencyTimer.getPastEvents('LockupOffered');
      lockup = await Lockup.at(evt.args.addr);
    });

    it('Exchanges ECOx for lockup', async () => {
      await ecox.exchange(new BN('100'), { from: alice });
      expect(await ecox.balanceOf(alice)).to.eq.BN('400');
      expect(await token.balanceOf(alice)).to.eq.BN('20000');
      expect(await lockup.depositBalances(alice)).to.eq.BN('5000');
    });
  });
});
