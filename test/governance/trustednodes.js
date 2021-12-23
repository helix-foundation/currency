const chai = require('chai');
const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers');
const bnChai = require('bn-chai');
const util = require('../../tools/test/util');

const { BN, toBN } = web3.utils;
chai.use(bnChai(BN));
const { expect } = chai;

contract('TrustedNodes [@group=7]', (accounts) => {
  let policy;
  let trustedNodes;

  const alice = accounts[0];
  const bob = accounts[1];
  let counter = 0;

  beforeEach(async () => {
    ({ policy, trustedNodes } = await util.deployPolicy(accounts[counter], { trustees: [bob] }));
    counter++;
  });

  describe('trust', () => {
    context('when called directly', () => {
      it('reverts', async () => {
        await expectRevert(
          trustedNodes.trust(alice),
          'Only the policy contract',
        );
      });
    });

    context('when called by the policy contract', () => {
      context('on an address that is in the set', () => {
        it('reverts', async () => {
          await expectRevert(
            policy.testTrust(trustedNodes.address, bob),
            'already trusted',
          );
        });
      });

      context('on an address that is not in the set', () => {
        context('when there are no empty slots', () => {
          it('succeeds', async () => {
            const tx = await policy.testTrust(trustedNodes.address, alice);
            await expectEvent.inTransaction(tx.tx, trustedNodes.constructor, 'TrustedNodeAdded', {
              node: alice,
            });
          });

          it('adds the address to the set', async () => {
            await policy.testTrust(trustedNodes.address, alice);

            expect(await trustedNodes.isTrusted(alice)).to.be.true;
          });
        });

        context('when there are empty slots', () => {
          beforeEach(async () => {
            await policy.testDistrust(trustedNodes.address, bob);
          });

          it('succeeds', async () => {
            await policy.testTrust(trustedNodes.address, alice);
          });

          it('adds the address to the set', async () => {
            await policy.testTrust(trustedNodes.address, alice);

            expect(await trustedNodes.isTrusted(alice)).to.be.true;
          });
        });
      });
    });
  });

  describe('distrust', () => {
    context('when called directly', () => {
      it('reverts', async () => {
        await expectRevert(
          trustedNodes.distrust(bob),
          'Only the policy contract',
        );
      });
    });

    context('when called by the policy contract', () => {
      context('on an address that is in the set', () => {
        it('succeeds', async () => {
          const tx = await policy.testDistrust(trustedNodes.address, bob);
          await expectEvent.inTransaction(tx.tx, trustedNodes.constructor, 'TrustedNodeRemoved', {
            node: bob,
          });
        });

        it('removes the address from the set', async () => {
          await policy.testDistrust(trustedNodes.address, bob);

          expect(await trustedNodes.isTrusted(bob)).to.be.false;
        });
      });

      context('when there are multiple addresses in the set', () => {
        beforeEach(async () => {
          await policy.testTrust(trustedNodes.address, alice);
        });

        it('Can remove the first address', async () => {
          await policy.testDistrust(trustedNodes.address, bob);
          expect(await trustedNodes.isTrusted(alice)).to.be.true;
          expect(await trustedNodes.isTrusted(bob)).to.be.false;
        });

        it('Can remove the second address', async () => {
          await policy.testDistrust(trustedNodes.address, alice);
          expect(await trustedNodes.isTrusted(alice)).to.be.false;
          expect(await trustedNodes.isTrusted(bob)).to.be.true;
        });

        it('Can remove both addresses', async () => {
          await policy.testDistrust(trustedNodes.address, bob);
          await policy.testDistrust(trustedNodes.address, alice);
          expect(await trustedNodes.isTrusted(alice)).to.be.false;
          expect(await trustedNodes.isTrusted(bob)).to.be.false;
        });

        it('Can remove and readd both addresses', async () => {
          await policy.testDistrust(trustedNodes.address, bob);
          await policy.testDistrust(trustedNodes.address, alice);
          await policy.testTrust(trustedNodes.address, alice);
          await policy.testTrust(trustedNodes.address, bob);

          expect(await trustedNodes.isTrusted(alice)).to.be.true;
          expect(await trustedNodes.isTrusted(bob)).to.be.true;
        });
      });

      context('on an address that is not in the set', () => {
        it('reverts', async () => {
          await expectRevert(
            policy.testDistrust(trustedNodes.address, alice),
            'Node already not trusted',
          );
        });
      });
    });
  });

  describe('numTrustees', () => {
    context('adding adding an address to the set', () => {
      context('that is not already present', () => {
        it('increases the nodes length', async () => {
          const preAddLength = toBN(await trustedNodes.numTrustees());

          await policy.testTrust(trustedNodes.address, alice);

          expect(
            toBN(await trustedNodes.numTrustees())
              .sub(preAddLength),
          ).to.eq.BN(1);
        });
      });
    });

    context('removing an address from the set', () => {
      it('decreases the nodes length', async () => {
        await policy.testTrust(trustedNodes.address, alice);
        const preAddLength = toBN(await trustedNodes.numTrustees());

        await policy.testDistrust(trustedNodes.address, alice);

        expect(
          preAddLength
            .sub(toBN(await trustedNodes.numTrustees())),
        ).to.eq.BN(1);
      });
    });
  });

  describe('redeemVoteRewards', () => {
    context('checking revert on no reward to redeem', () => {
      it('reverts', async () => {
        await expectRevert(
          trustedNodes.redeemVoteRewards({ from: bob }),
          'No rewards to redeem',
        );
      });
    });
  });

  describe('recordVote', () => {
    context('checking revert on non-authorized call', () => {
      it('reverts', async () => {
        await expectRevert(
          trustedNodes.recordVote(bob, { from: alice }),
          'Must be the monetary policy contract to call',
        );
      });
    });
  });
});
