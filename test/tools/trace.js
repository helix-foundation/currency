const { expectRevert } = require('@openzeppelin/test-helpers');
const util = require('../../tools/test/util');

const TrustedNodes = artifacts.require('TrustedNodes');

contract('trace', ([accountA, accountB]) => {
  let policy;
  let trustedNodes;

  beforeEach(async () => {
    ({ policy } = await util.deployPolicy());
    trustedNodes = await TrustedNodes.new(policy.address, [accountB], 1);
  });

  it('traces reverting transactions', async () => {
    await expectRevert(
      util.trace(trustedNodes.trust(accountA)),
      'Only the policy contract',
    );
  });
});
