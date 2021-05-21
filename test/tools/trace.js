const { expectRevert } = require('@openzeppelin/test-helpers');
const util = require('../../tools/test/util.js');

const TrustedNodes = artifacts.require('TrustedNodes');

contract('trace', ([accountA, accountB]) => {
  let policy;
  let trustedNodes;

  beforeEach(async () => {
    ({ policy } = await util.deployPolicy());
    trustedNodes = await TrustedNodes.new(policy.address, [accountB]);
  });

  it('traces reverting transactions', async () => {
    await expectRevert(
      util.trace(trustedNodes.trust(accountA)),
      'Only the policy contract',
    );
  });
});
