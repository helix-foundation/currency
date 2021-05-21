const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const util = require('../../tools/test/util.js');

const TrustedNodes = artifacts.require('TrustedNodes');

const { toBN } = web3.utils;

contract('TrustedNodes [@group=2]', ([accountA, accountB]) => {
  let policy;
  let trustedNodes;

  beforeEach(async () => {
    ({ policy } = await util.deployPolicy());
    trustedNodes = await TrustedNodes.new(policy.address, [accountB]);
  });

  describe('trust', () => {
    context('when called directly', () => {
      it('reverts', async () => {
        await expectRevert(
          trustedNodes.trust(accountA),
          'Only the policy contract',
        );
      });
    });

    context('when called by the policy contract', () => {
      context('on an address that is in the set', () => {
        it('reverts', async () => {
          await expectRevert(
            policy.testTrust(trustedNodes.address, accountB),
            'already trusted',
          );
        });
      });

      context('on an address that is not in the set', () => {
        context('when there are no empty slots', () => {
          it('succeeds', async () => {
            const tx = await policy.testTrust(trustedNodes.address, accountA);
            await expectEvent.inTransaction(tx.tx, trustedNodes.constructor, 'TrustedNodeAdded', {
              node: accountA,
            });
          });

          it('adds the address to the set', async () => {
            await policy.testTrust(trustedNodes.address, accountA);

            assert(await trustedNodes.isTrusted(accountA));
          });
        });

        context('when there are empty slots', () => {
          beforeEach(async () => {
            await policy.testDistrust(trustedNodes.address, accountB);
          });

          it('succeeds', async () => {
            await policy.testTrust(trustedNodes.address, accountA);
          });

          it('adds the address to the set', async () => {
            await policy.testTrust(trustedNodes.address, accountA);

            assert(await trustedNodes.isTrusted(accountA));
          });
        });
      });
    });
  });

  describe('distrust', () => {
    context('when called directly', () => {
      it('reverts', async () => {
        await expectRevert(
          trustedNodes.distrust(accountB),
          'Only the policy contract',
        );
      });
    });

    context('when called by the policy contract', () => {
      context('on an address that is in the set', () => {
        it('succeeds', async () => {
          const tx = await policy.testDistrust(trustedNodes.address, accountB);
          await expectEvent.inTransaction(tx.tx, trustedNodes.constructor, 'TrustedNodeRemoved', {
            node: accountB,
          });
        });

        it('removes the address from the set', async () => {
          await policy.testDistrust(trustedNodes.address, accountB);

          assert(!(await trustedNodes.isTrusted(accountB)));
        });
      });

      context('when there are multiple addresses in the set', () => {
        beforeEach(async () => {
          await policy.testTrust(trustedNodes.address, accountA);
        });

        it('Can remove the first address', async () => {
          await policy.testDistrust(trustedNodes.address, accountB);
          assert(await trustedNodes.isTrusted(accountA));
          assert(!await trustedNodes.isTrusted(accountB));
        });

        it('Can remove the second address', async () => {
          await policy.testDistrust(trustedNodes.address, accountA);
          assert(!await trustedNodes.isTrusted(accountA));
          assert(await trustedNodes.isTrusted(accountB));
        });

        it('Can remove both addresses', async () => {
          await policy.testDistrust(trustedNodes.address, accountB);
          await policy.testDistrust(trustedNodes.address, accountA);
          assert(!await trustedNodes.isTrusted(accountA));
          assert(!await trustedNodes.isTrusted(accountB));
        });

        it('Can remove and readd both addresses', async () => {
          await policy.testDistrust(trustedNodes.address, accountB);
          await policy.testDistrust(trustedNodes.address, accountA);
          await policy.testTrust(trustedNodes.address, accountA);
          await policy.testTrust(trustedNodes.address, accountB);

          assert(await trustedNodes.isTrusted(accountA));
          assert(await trustedNodes.isTrusted(accountB));
        });
      });

      context('on an address that is not in the set', () => {
        it('reverts', async () => {
          await expectRevert(
            policy.testDistrust(trustedNodes.address, accountA),
            'Cannot distrust a node that is already not trusted',
          );
        });
      });
    });
  });

  describe('trustedNodesLength', () => {
    context('adding adding an address to the set', () => {
      context('that is not already present', () => {
        it('increases the nodes length', async () => {
          const preAddLength = toBN(await trustedNodes.trustedNodesLength());

          await policy.testTrust(trustedNodes.address, accountA);

          assert(
            toBN(await trustedNodes.trustedNodesLength())
              .sub(preAddLength)
              .eqn(1),
          );
        });
      });
    });

    context('removing an address from the set', () => {
      it('decreases the nodes length', async () => {
        await policy.testTrust(trustedNodes.address, accountA);
        const preAddLength = toBN(await trustedNodes.trustedNodesLength());

        await policy.testDistrust(trustedNodes.address, accountA);

        assert(
          preAddLength
            .sub(toBN(await trustedNodes.trustedNodesLength()))
            .eq(toBN(1)),
        );
      });
    });
  });
});
