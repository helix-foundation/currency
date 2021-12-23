const { expectRevert } = require('@openzeppelin/test-helpers');
const util = require('../../tools/test/util');

contract('trace', (accounts) => {
  let trustedNodes;

  const alice = accounts[0];
  const bob = accounts[1];
  let counter = 0;

  beforeEach(async () => {
    ({ trustedNodes } = await util.deployPolicy(accounts[counter], { trustees: [bob] }));
    counter++;
  });

  it('traces reverting transactions', async () => {
    await expectRevert(
      util.trace(trustedNodes.trust(alice)),
      'Only the policy contract',
    );
  });
});
