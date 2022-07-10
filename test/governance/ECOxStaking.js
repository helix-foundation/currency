const { expect } = require('chai');

const { ethers } = require('hardhat');
const { ecoFixture } = require('../utils/fixtures');

const time = require('../utils/time');
const { deploy } = require('../utils/contracts');

describe('ecoXStaking [@group=12]', () => {
  let alice;
  let bob;
  let charlie;
  let policy;
  let eco;
  let faucet;
  let timedPolicies;
  let proposals;
  let testProposal;
  let votes;
  let ecox;
  let ecoXStaking;
  let one;

  beforeEach(async () => {
    one = ethers.utils.parseEther('1');
    const accounts = await ethers.getSigners();
    [alice, bob, charlie] = accounts;
    const trustednodes = [await bob.getAddress()];

    ({
      policy, eco, faucet, timedPolicies, ecox, ecoXStaking,
    } = await ecoFixture(trustednodes));

    await faucet.mint(await alice.getAddress(), one.mul(5000));
    await faucet.mint(await bob.getAddress(), one.mul(5000));
    await faucet.mint(await charlie.getAddress(), one.mul(10000));

    await faucet.mintx(await alice.getAddress(), one.mul(400));
    await faucet.mintx(await bob.getAddress(), one.mul(400));
    await faucet.mintx(await charlie.getAddress(), one.mul(200));

    await time.increase(3600 * 24 * 14 + 1);
    await timedPolicies.incrementGeneration();

    await time.advanceBlock();
  });

  describe('unauthorized call of recordVote', () => {
    it('reverts', async () => {
      await expect(ecoXStaking.recordVote(await alice.getAddress())).to.be.revertedWith(
        'Must be a voting contract to call',
      );
    });
  });

  describe('disabled ERC20 functionality', () => {
    it('reverts on transfer', async () => {
      await expect(ecoXStaking.transfer(await alice.getAddress(), 1000)).to.be.revertedWith(
        'sECOx is non-transferrable',
      );
    });

    it('reverts on transferFrom', async () => {
      await expect(
        ecoXStaking.transferFrom(await alice.getAddress(), await bob.getAddress(), 1000),
      ).to.be.revertedWith('sECOx is non-transferrable');
    });
  });

  async function makeProposals() {
    const implementation = await deploy(
      'PolicyProposals',
      policy.address,
      (
        await deploy('PolicyVotes', policy.address, eco.address, ecox.address)
      ).address,
      eco.address,
      ecox.address,
    );
    const cloner = await deploy('Cloner', implementation.address);
    const policyProposalsClone = await ethers.getContractAt(
      'PolicyProposals',
      await cloner.clone(),
    );
    await policy.testDirectSet('PolicyProposals', policyProposalsClone.address);
    return policyProposalsClone;
  }

  context('authed recordVote', () => {
    let blockNumber;

    beforeEach(async () => {
      // we need to get the addresses some voting power
      await ecox.connect(alice).approve(ecoXStaking.address, one.mul(10));
      await ecoXStaking.connect(alice).deposit(one.mul(10));

      await ecox.connect(charlie).approve(ecoXStaking.address, one.mul(100));
      await ecoXStaking.connect(charlie).deposit(one.mul(100));

      blockNumber = await time.latestBlock();

      await time.increase(3600 * 24 * 14 + 1);
      await timedPolicies.incrementGeneration();
      await time.increase(3600 * 24 * 14 + 1);
      await timedPolicies.incrementGeneration();

      proposals = await makeProposals();

      testProposal = await deploy('Empty', 1);

      await eco.approve(proposals.address, await proposals.COST_REGISTER());

      await proposals.registerProposal(testProposal.address);
    });

    context('basic token and checkpoints data', async () => {
      // Confirm the internal balance method works
      it('can get the balance', async () => {
        expect(await ecoXStaking.balanceOf(await alice.getAddress())).to.equal(one.mul(10));
      });

      it('Can get the past total supply', async () => {
        const pastTotalSupply = await ecoXStaking.totalSupplyAt(blockNumber);
        expect(pastTotalSupply).to.be.equal(one.mul(110));
      });

      it('Can get a past balance', async () => {
        const pastBalance = await ecoXStaking.getPastVotes(await alice.getAddress(), blockNumber);
        expect(pastBalance).to.be.equal(one.mul(10));
      });
    });

    context('alice supporting a proposal', () => {
      beforeEach(async () => {
        await proposals.connect(alice).support(testProposal.address);
      });

      it('alice successfully added voting support to the proposal', async () => {
        const testProposalObj = await proposals.proposals(testProposal.address);
        expect(testProposalObj.totalStake).to.equal('5010000000000000000000');
      });

      it('alice cannot withdraw', async () => {
        await expect(ecoXStaking.connect(alice).withdraw(one.mul(10))).to.be.revertedWith(
          'Must not vote or undelegate in the generation on or before withdrawing',
        );
      });

      it('alice can still deposit', async () => {
        await ecox.connect(alice).approve(ecoXStaking.address, one.mul(10));
        await ecoXStaking.connect(alice).deposit(one.mul(10));
      });

      it('alice cannot deposit more than approved', async () => {
        await ecox.connect(alice).approve(ecoXStaking.address, one.mul(10));
        await expect(ecoXStaking.connect(alice).deposit(one.mul(1000))).to.be.revertedWith(
          'ERC20: transfer amount exceeds allowance',
        );
      });
    });

    context('charlie supports a proposal into a vote', () => {
      beforeEach(async () => {
        await proposals.connect(charlie).support(testProposal.address);
        const tx = await proposals.connect(charlie).deployProposalVoting();
        const receipt = await tx.wait();

        const votesAddress = receipt.events.find((t) => t.event === 'VoteStart').args
          .contractAddress;
        votes = await ethers.getContractAt('PolicyVotes', votesAddress);
      });

      it('charlie can vote', async () => {
        await votes.connect(charlie).vote(true);
        expect(await votes.yesStake()).to.equal('10100000000000000000000');
      });

      it('alice can withdraw then vote', async () => {
        await ecoXStaking.connect(alice).withdraw(one.mul(1));
        await votes.connect(alice).vote(true);
      });

      it('alice cannot vote then withdraw', async () => {
        await votes.connect(alice).vote(true);
        await expect(ecoXStaking.connect(alice).withdraw(one.mul(10))).to.be.revertedWith(
          'Must not vote or undelegate in the generation on or before withdrawing',
        );
      });

      it('charlie supported, so cannot withdraw', async () => {
        await expect(ecoXStaking.connect(charlie).withdraw(one.mul(10))).to.be.revertedWith(
          'Must not vote or undelegate in the generation on or before withdrawing',
        );
      });

      it('charlie supported, so cannot withdraw in the next generation', async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();

        await expect(ecoXStaking.connect(charlie).withdraw(one.mul(10))).to.be.revertedWith(
          'Must not vote or undelegate in the generation on or before withdrawing',
        );
      });

      it('charlie supported, but can withdraw the generation after next', async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();

        await ecoXStaking.connect(charlie).withdraw(one.mul(10));
      });
    });
  });

  context('delegation and withdrawals', () => {
    beforeEach(async () => {
      // we need to get the addresses some voting power
      await ecox.connect(alice).approve(ecoXStaking.address, one.mul(10));
      await ecoXStaking.connect(alice).deposit(one.mul(10));

      await ecox.connect(bob).approve(ecoXStaking.address, one.mul(100));
      await ecoXStaking.connect(bob).deposit(one.mul(100));

      await ecoXStaking.connect(bob).enableDelegation();
    });

    it('delegate works as expected', async () => {
      await ecoXStaking.connect(alice).delegate(await bob.getAddress());
      const blockNumber = await time.latestBlock();
      await time.increase(10);
      expect(await ecoXStaking.getVotingGons(await bob.getAddress())).to.equal(one.mul(110));
      expect(await ecoXStaking.votingECOx(await bob.getAddress(), blockNumber)).to.equal(
        one.mul(110),
      );
    });

    context('undelegate transfers voting record', () => {
      beforeEach(async () => {
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();
        await time.increase(3600 * 24 * 14 + 1);
        await timedPolicies.incrementGeneration();

        proposals = await makeProposals();

        testProposal = await deploy('Empty', 1);

        await eco.approve(proposals.address, await proposals.COST_REGISTER());

        await proposals.registerProposal(testProposal.address);
      });

      context('delegatee did not vote', () => {
        beforeEach(async () => {
          await ecoXStaking.connect(alice).delegate(await bob.getAddress());
        });

        it('no effect on withdrawal', async () => {
          await ecoXStaking.connect(alice).undelegate();
          await ecoXStaking.connect(alice).withdraw(one.mul(10));
        });

        it('can withdraw without undelegating', async () => {
          await ecoXStaking.connect(alice).withdraw(one.mul(10));
        });
      });

      context('delegatee did vote', () => {
        beforeEach(async () => {
          await ecoXStaking.connect(alice).delegate(await bob.getAddress());
          await proposals.connect(bob).support(testProposal.address);
          await time.advanceBlock();
        });

        context('immediately after the vote', () => {
          it('blocks if delegatee did vote', async () => {
            await ecoXStaking.connect(alice).undelegate();
            await expect(ecoXStaking.connect(alice).withdraw(one.mul(10))).to.be.revertedWith(
              'Must not vote or undelegate in the generation on or before withdrawing',
            );
          });

          it('cannot withdraw without undelegating', async () => {
            await expect(ecoXStaking.connect(alice).withdraw(one.mul(10))).to.be.revertedWith(
              'Must not vote or undelegate in the generation on or before withdrawing',
            );
          });

          it('undelegateFromAddress blocks withdrawal', async () => {
            await ecoXStaking.connect(alice).undelegateFromAddress(await bob.getAddress());
            await expect(ecoXStaking.connect(alice).withdraw(one.mul(10))).to.be.revertedWith(
              'Must not vote or undelegate in the generation on or before withdrawing',
            );
          });
        });

        context('1 generation after the vote', () => {
          beforeEach(async () => {
            await time.increase(3600 * 24 * 14 + 1);
            await timedPolicies.incrementGeneration();
          });

          it('blocks if delegatee did vote', async () => {
            await ecoXStaking.connect(alice).undelegate();
            await expect(ecoXStaking.connect(alice).withdraw(one.mul(10))).to.be.revertedWith(
              'Must not vote or undelegate in the generation on or before withdrawing',
            );
          });

          it('cannot withdraw without undelegating', async () => {
            await expect(ecoXStaking.connect(alice).withdraw(one.mul(10))).to.be.revertedWith(
              'Must not vote or undelegate in the generation on or before withdrawing',
            );
          });

          it('undelegateFromAddress blocks withdrawal', async () => {
            await ecoXStaking.connect(alice).undelegateFromAddress(await bob.getAddress());
            await expect(ecoXStaking.connect(alice).withdraw(one.mul(10))).to.be.revertedWith(
              'Must not vote or undelegate in the generation on or before withdrawing',
            );
          });
        });

        context('2 generations after the vote', () => {
          beforeEach(async () => {
            await time.increase(3600 * 24 * 14 + 1);
            await timedPolicies.incrementGeneration();
            await time.increase(3600 * 24 * 14 + 1);
            await timedPolicies.incrementGeneration();
          });

          it('can now withdraw', async () => {
            await ecoXStaking.connect(alice).undelegate();
            await ecoXStaking.connect(alice).withdraw(one.mul(10));
          });

          it('can withdraw without undelegating', async () => {
            await ecoXStaking.connect(alice).withdraw(one.mul(10));
          });

          it('undelegateFromAddress dose not block withdrawal', async () => {
            await ecoXStaking.connect(alice).undelegateFromAddress(await bob.getAddress());
            await ecoXStaking.connect(alice).withdraw(one.mul(10));
          });
        });
      });

      context('partial delegation', () => {
        it('can still withdraw if delegation is partial', async () => {
          await ecoXStaking.connect(alice).delegateAmount(await bob.getAddress(), one.mul(5));
          await proposals.connect(bob).support(testProposal.address);
          await ecoXStaking.connect(alice).withdraw(one.mul(5));
        });
      });
    });
  });
});