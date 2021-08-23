/* eslint-disable no-underscore-dangle */

const CurrencyGovernance = artifacts.require('CurrencyGovernance');
const Cloner = artifacts.require('Cloner');

const chai = require('chai');
const bnChai = require('bn-chai');

const { expect } = chai;

const { BN, toBN } = web3.utils;
const {
  expectRevert, time,
} = require('@openzeppelin/test-helpers');

const util = require('../../tools/test/util');

chai.use(bnChai(BN));

contract('CurrencyGovernance [@group=8]', ([alice, bob, charlie, dave]) => {
  let policy;
  let borda;

  beforeEach(async () => {
    ({
      policy,
    } = await util.deployPolicy({ trustees: [bob, charlie, dave] }));

    const originalBorda = await CurrencyGovernance.new(policy.address);
    const cloner = await Cloner.new(originalBorda.address);
    borda = await CurrencyGovernance.at(await cloner.clone());
  });

  describe('Propose phase', () => {
    it('Doesn\'t allow non-trustee to propose', async () => {
      await expectRevert(borda.propose(33, 34, 35, 36, toBN('1000000000000000000')), 'Only trusted nodes can call this method');
    });

    it('Allows trustees to propose', async () => {
      await borda.propose(33, 34, 35, 36, toBN('1000000000000000000'), { from: bob });

      const p = await borda.proposals(bob);
      expect(p.valid).to.be.true;
      expect(p.randomInflationWinners).to.eq.BN(33);
    });

    it('Doesn\'t allow voting yet', async () => {
      await expectRevert(borda.commit(web3.utils.randomHex(32), { from: bob }), 'This call is not allowed at this stage');
    });

    it('Allows removing proposals', async () => {
      await borda.propose(33, 34, 35, 36, toBN('1000000000000000000'), { from: bob });
      await borda.unpropose({ from: bob });

      const p = await borda.proposals(bob);
      expect(p.valid).to.be.false;
    });
  });

  describe('Voting phase', () => {
    beforeEach(async () => {
      await borda.propose(10, 10, 10, 10, toBN('1000000000000000000'), { from: dave });
      await borda.propose(20, 20, 20, 20, toBN('1000000000000000000'), { from: charlie });
      await borda.propose(30, 30, 30, 30, toBN('1000000000000000000'), { from: bob });
      await time.increase(3600 * 24 * 10.1);
    });

    it('Doesn\'t allow non-trustee to vote', async () => {
      await expectRevert(borda.commit(web3.utils.randomHex(32)), 'Only trusted nodes can call this method');
    });

    it('Allows trustees to vote', async () => {
      await borda.commit(web3.utils.randomHex(32), { from: bob });
    });
  });

  describe('Reveal phase', () => {
    const hash = (x) => web3.utils.soliditySha3({ type: 'bytes32', value: x[0] }, { type: 'address', value: x[1] }, { type: 'address', value: x[2] });

    it('Cannot reveal without voting', async () => {
      await time.increase(3600 * 24 * 10.1);
      await borda.updateStage();
      await time.increase(3600 * 24 * 3);

      await expectRevert(borda.reveal(web3.utils.randomHex(32), [bob, charlie]), 'No unrevealed commitment exists');
    });

    it('Rejects empty votes', async () => {
      const seed = web3.utils.randomHex(32);
      await time.increase(3600 * 24 * 10.1);
      await borda.commit(hash([seed, bob, []]), { from: bob });
      await time.increase(3600 * 24 * 3);
      await expectRevert(borda.reveal(seed, [], { from: bob }), 'Cannot vote empty');
    });

    it('Rejects invalid votes', async () => {
      const seed = web3.utils.randomHex(32);
      await time.increase(3600 * 24 * 10.1);
      await borda.commit(hash([seed, bob, [alice]]), { from: bob });
      await time.increase(3600 * 24 * 3);
      await expectRevert(borda.reveal(seed, [alice], { from: bob }), 'Invalid vote');
    });

    it('Reject duplicate votes', async () => {
      const seed = web3.utils.randomHex(32);
      await borda.propose(30, 30, 30, 30, toBN('1000000000000000000'), { from: bob });
      await time.increase(3600 * 24 * 10.1);
      await borda.commit(hash([seed, bob, [bob, bob]]), { from: bob });
      await time.increase(3600 * 24 * 3);
      await expectRevert(borda.reveal(seed, [bob, bob], { from: bob }), 'Repeated vote');
    });

    it('Rejects changed votes', async () => {
      const seed = web3.utils.randomHex(32);
      await time.increase(3600 * 24 * 10.1);
      await borda.commit(hash([seed, bob, [bob]]), { from: bob });
      await time.increase(3600 * 24 * 3);
      await expectRevert(borda.reveal(seed, [charlie], { from: bob }), 'Commitment mismatch');
    });

    it('Allows reveals of correct votes', async () => {
      const seed = web3.utils.randomHex(32);
      await borda.propose(30, 30, 30, 30, toBN('1000000000000000000'), { from: bob });
      await time.increase(3600 * 24 * 10.1);
      await borda.commit(hash([seed, bob, [bob]]), { from: bob });
      await time.increase(3600 * 24 * 3);
      await borda.reveal(seed, [bob], { from: bob });
    });

    describe('With valid commits', async () => {
      const bobvote = [web3.utils.randomHex(32), bob, [bob, charlie, dave]];
      const charlievote = [web3.utils.randomHex(32), charlie, [charlie]];
      const davevote = [web3.utils.randomHex(32), dave, [dave, charlie, bob]];

      beforeEach(async () => {
        await borda.propose(10, 10, 10, 10, toBN('1000000000000000000'), { from: dave });
        await borda.propose(20, 20, 20, 20, toBN('1000000000000000000'), { from: charlie });
        await borda.propose(30, 30, 30, 30, toBN('1000000000000000000'), { from: bob });
        await time.increase(3600 * 24 * 10.1);

        await borda.commit(hash(bobvote), { from: bob });
        await borda.commit(hash(charlievote), { from: charlie });
        await borda.commit(hash(davevote), { from: dave });

        await time.increase(3600 * 24 * 3);
      });

      it('Updates state after bob reveals', async () => {
        await borda.reveal(bobvote[0], bobvote[2], { from: bob });
        expect(await borda.score(bob)).to.eq.BN(3);
        expect(await borda.score(charlie)).to.eq.BN(2);
        expect(await borda.score(dave)).to.eq.BN(1);
        expect(await borda.leader()).to.equal(bob);
      });

      it('Updates state after bob and charlie reveals', async () => {
        await borda.reveal(bobvote[0], bobvote[2], { from: bob });
        // Charlie has only 1 vote, and as each vote gets n-1 points, this does nothing
        await borda.reveal(charlievote[0], charlievote[2], { from: charlie });
        expect(await borda.score(bob)).to.eq.BN(3);
        expect(await borda.score(charlie)).to.eq.BN(3);
        expect(await borda.score(dave)).to.eq.BN(1);
        expect(await borda.leader()).to.equal(bob);
      });

      it('Updates state after everyone reveals', async () => {
        await borda.reveal(bobvote[0], bobvote[2], { from: bob });
        await borda.reveal(charlievote[0], charlievote[2], { from: charlie });
        await borda.reveal(davevote[0], davevote[2], { from: dave });
        expect(await borda.score(bob)).to.eq.BN(4);
        expect(await borda.score(charlie)).to.eq.BN(5);
        expect(await borda.score(dave)).to.eq.BN(4);
        expect(await borda.leader()).to.equal(charlie);
      });

      it('Computing defaults if no one reveals', async () => {
        await time.increase(3600 * 24 * 1);
        await borda.updateStage();
        await borda.compute();
        expect(await borda.winner()).to.equal('0x0000000000000000000000000000000000000000');
      });

      it('Charlie reveal should not override the default vote', async () => {
        await borda.reveal(charlievote[0], charlievote[2], { from: charlie });
        await time.increase(3600 * 24 * 1);
        await borda.updateStage();
        await borda.compute();
        expect(await borda.winner()).to.equal('0x0000000000000000000000000000000000000000');
      });

      describe('Compute Phase', async () => {
        beforeEach(async () => {
          await borda.reveal(bobvote[0], bobvote[2], { from: bob });
          await borda.reveal(charlievote[0], charlievote[2], { from: charlie });
          await borda.reveal(davevote[0], davevote[2], { from: dave });
        });
        it('Picks a winner', async () => {
          await time.increase(3600 * 24 * 1);
          await borda.updateStage();
          await borda.compute();
          expect(await borda.winner()).to.equal(charlie);
        });
      });
    });
  });
});
