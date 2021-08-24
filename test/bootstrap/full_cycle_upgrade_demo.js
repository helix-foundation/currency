const EcoBootstrap = artifacts.require('EcoBootstrap');

const EcoInitializable = artifacts.require('EcoInitializable');
const Token20 = artifacts.require('Token20');
const Token827 = artifacts.require('Token827');
const TokenTarget = artifacts.require('TokenTarget');
const { assert } = require('chai');
const { expectRevert } = require('@openzeppelin/test-helpers');

const Nick = require('../../tools/nicks');
const { isCoverage } = require('../../tools/test/coverage');

/*
 * Demonstrate full cycle upgrade with constant address.
 * This 'unit test' maintains state between it() statements, and is intended
 * as a demo, not a unit test.
 */

contract('Full upgrade cycle [@group=9]', async (accounts) => {
  let token;
  let target;

  it('deploys the bootstrap', async () => {
    const gasCostFactor = (await isCoverage()) ? 1000 : 1;

    const nick = Nick.decorateTx(
      Nick.generateTx(
        EcoBootstrap.bytecode,
        web3.utils.randomHex(16),
        5000000 * gasCostFactor,
        100000000000 / gasCostFactor,
        web3.eth.abi.encodeParameter('address', accounts[2]),
      ),
    );

    await web3.eth.sendTransaction(
      { from: accounts[0], to: nick.from, value: '500000000000000000' },
    );

    await web3.eth.sendSignedTransaction(nick.raw);

    const boot = await EcoBootstrap.at(nick.to);

    token = await EcoInitializable.at(await boot.placeholders(0));
    target = await TokenTarget.new(token.address);

    // token now points at the first initializable proxy, which
    // only accounts[2] is allowed to change
  });

  it('deploys ERC20 code at the fixed address', async () => {
    const erc20 = await Token20.new({ from: accounts[3] });
    await token.fuseImplementation(erc20.address, { from: accounts[2] });
    token = await Token827.at(token.address);

    // token points at the same address, but the proxy now
    // forwards to an ERC20 implementation. The initialize() for
    // Token20 also copies owner, which means it's now accounts[3]
  });

  it('mints 20 coins for acccounts[1]', async () => {
    await token.mint(accounts[1], 20, { from: accounts[3] });
  });

  it('can approve and transfer with ERC20', async () => {
    await token.approve(target.address, 1, { from: accounts[1] });
    await target.take(accounts[1], 1);

    if (await isCoverage()) {
      return;
    }

    assert.equal((await token.balanceOf(accounts[1])).toNumber(), 19);
    assert.equal((await token.balanceOf(target.address)).toNumber(), 1);
  });

  it('cannot use ERC827', async () => {
    await expectRevert.unspecified(
      token.approveAndCall(
        target.address,
        1,
        web3.eth.abi.encodeFunctionCall(TokenTarget.abi[2], [accounts[1], 1]),
        { from: accounts[1] },
      ),
    );
  });

  it('upgrades to ERC827', async () => {
    const erc827 = await Token827.new({ from: accounts[3] });

    // Since this is an upgrade, it doesn't matter how storage
    // for 827 is initialized.
    await token.upgrade(erc827.address, { from: accounts[3] });
  });

  it('still has the same balances', async () => {
    if (await isCoverage()) {
      return;
    }

    assert.equal((await token.balanceOf(accounts[1])).toNumber(), 19);
    assert.equal((await token.balanceOf(target.address)).toNumber(), 1);
  });

  it('approve+transfer with ERC827', async () => {
    await token.approveAndCall(
      target.address,
      1,
      web3.eth.abi.encodeFunctionCall(TokenTarget.abi[2], [accounts[1], 1]),
      { from: accounts[1] },
    );

    if (await isCoverage()) {
      return;
    }

    assert.equal((await token.balanceOf(accounts[1])).toNumber(), 18);
    assert.equal((await token.balanceOf(target.address)).toNumber(), 2);
  });
});
