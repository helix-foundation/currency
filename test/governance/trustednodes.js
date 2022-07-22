const { ethers } = require('hardhat');

const { BigNumber } = ethers;
const { expect } = require('chai');
const { deploy } = require('../utils/contracts');
const { singletonsFixture, ecoFixture } = require('../utils/fixtures');

describe('TrustedNodes [@group=7]', () => {
  // const fixture = async () => {
  //   const accounts = await ethers.getSigners();
  //   const alice = accounts[0];
  //   const bob = accounts[1];
  //   await singletonsFixture(alice);
  //   const policy = await deploy('PolicyTest');
  //   const trustedNodes = await deploy(
  //     'TrustedNodes',
  //     policy.address,
  //     [await bob.getAddress()],
  //     100,
  //   );
  //   return {
  //     policy,
  //     trustedNodes,
  //     alice,
  //     bob,
  //   };
  // };

  let policy;
  let trustedNodes;
  let alice;
  let bob;
  
  before(async () => {
    const accounts = await ethers.getSigners();
    alice = accounts[0];
    bob = accounts[1];
    // additionalTrustees = accounts.slice(4, 11);
  });

  context('test', () => {
    beforeEach(async () => {
      const nodes = [
        await bob.getAddress(),
      ];
      
      ({
        policy, trustedNodes,
      } = await ecoFixture(nodes, 100));
    });
  
    describe('trust', () => {
      describe('when called directly', () => {
        it('reverts', async () => {
          await expect(trustedNodes.trust(await alice.getAddress())).to.be.revertedWith(
            'Only the policy contract',
          );
        });
      });
  
      describe('when called by the policy contract', () => {
        describe('on an address that is in the set', () => {
          it('reverts', async () => {
            await expect(
              policy.testTrust(trustedNodes.address, await bob.getAddress()),
            ).to.be.revertedWith('already trusted');
          });
        });
  
        describe('on an address that is not in the set', () => {
          describe('when there are no empty slots', () => {
            it('succeeds', async () => {
              await expect(policy.testTrust(trustedNodes.address, await alice.getAddress()))
                .to.emit(trustedNodes, 'TrustedNodeAdded')
                .withArgs(await alice.getAddress());
            });
  
            it('adds the address to the set', async () => {
              await policy.testTrust(trustedNodes.address, await alice.getAddress());
  
              expect(await trustedNodes.isTrusted(await alice.getAddress())).to.be.true;
            });
          });
  
          describe('when there are empty slots', () => {
            beforeEach(async () => {
              await policy.testDistrust(trustedNodes.address, await bob.getAddress());
            });
  
            it('succeeds', async () => {
              await policy.testTrust(trustedNodes.address, await alice.getAddress());
            });
  
            it('adds the address to the set', async () => {
              await policy.testTrust(trustedNodes.address, await alice.getAddress());
  
              expect(await trustedNodes.isTrusted(await alice.getAddress())).to.be.true;
            });
          });
        });
      });
    });
  
    describe('distrust', () => {
      describe('when called directly', () => {
        it('reverts', async () => {
          await expect(trustedNodes.distrust(await bob.getAddress())).to.be.revertedWith(
            'Only the policy contract',
          );
        });
      });
  
      describe('when called by the policy contract', () => {
        describe('on an address that is in the set', () => {
          it('succeeds', async () => {
            await expect(policy.testDistrust(trustedNodes.address, await bob.getAddress()))
              .to.emit(trustedNodes, 'TrustedNodeRemoved')
              .withArgs(await bob.getAddress());
          });
  
          it('removes the address from the set', async () => {
            await policy.testDistrust(trustedNodes.address, await bob.getAddress());
  
            expect(await trustedNodes.isTrusted(await bob.getAddress())).to.be.false;
          });
        });
  
        describe('when there are multiple addresses in the set', () => {
          beforeEach(async () => {
            await policy.testTrust(trustedNodes.address, await alice.getAddress());
          });
  
          it('Can remove the first address', async () => {
            await policy.testDistrust(trustedNodes.address, await bob.getAddress());
            expect(await trustedNodes.isTrusted(await alice.getAddress())).to.be.true;
            expect(await trustedNodes.isTrusted(await bob.getAddress())).to.be.false;
          });
  
          it('Can remove the second address', async () => {
            await policy.testDistrust(trustedNodes.address, await alice.getAddress());
            expect(await trustedNodes.isTrusted(await alice.getAddress())).to.be.false;
            expect(await trustedNodes.isTrusted(await bob.getAddress())).to.be.true;
          });
  
          it('Can remove both addresses', async () => {
            await policy.testDistrust(trustedNodes.address, await bob.getAddress());
            await policy.testDistrust(trustedNodes.address, await alice.getAddress());
            expect(await trustedNodes.isTrusted(await alice.getAddress())).to.be.false;
            expect(await trustedNodes.isTrusted(await bob.getAddress())).to.be.false;
          });
  
          it('Can remove and readd both addresses', async () => {
            await policy.testDistrust(trustedNodes.address, await bob.getAddress());
            await policy.testDistrust(trustedNodes.address, await alice.getAddress());
            await policy.testTrust(trustedNodes.address, await alice.getAddress());
            await policy.testTrust(trustedNodes.address, await bob.getAddress());
  
            expect(await trustedNodes.isTrusted(await alice.getAddress())).to.be.true;
            expect(await trustedNodes.isTrusted(await bob.getAddress())).to.be.true;
          });
        });
  
        describe('on an address that is not in the set', () => {
          it('reverts', async () => {
            await expect(
              policy.testDistrust(trustedNodes.address, await alice.getAddress()),
            ).to.be.revertedWith('Node already not trusted');
          });
        });
      });
    });
  
    describe('numTrustees', () => {
      describe('adding adding an address to the set', () => {
        describe('that is not already present', () => {
          it('increases the nodes length', async () => {
            const preAddLength = BigNumber.from(await trustedNodes.numTrustees());
  
            await policy.testTrust(trustedNodes.address, await alice.getAddress());
  
            expect(BigNumber.from(await trustedNodes.numTrustees()).sub(preAddLength)).to.equal(1);
          });
        });
      });
  
      describe('removing an address from the set', () => {
        it('decreases the nodes length', async () => {
          await policy.testTrust(trustedNodes.address, await alice.getAddress());
          const preAddLength = BigNumber.from(await trustedNodes.numTrustees());
  
          await policy.testDistrust(trustedNodes.address, await alice.getAddress());
  
          expect(preAddLength.sub(BigNumber.from(await trustedNodes.numTrustees()))).to.equal(1);
        });
      });
    });
  
    describe('redeemVoteRewards', () => {
      describe('checking revert on no reward to redeem', () => {
        it('reverts', async () => {
          await expect(trustedNodes.connect(bob).redeemVoteRewards()).to.be.revertedWith(
            'No rewards to redeem',
          );
        });
      });
    });
  
    describe('recordVote', () => {
      describe('checking revert on non-authorized call', () => {
        it('reverts', async () => {
          await expect(
            trustedNodes.connect(alice).recordVote(await bob.getAddress()),
          ).to.be.revertedWith('Must be the monetary policy contract to call');
        });
      });
    });
  });
})