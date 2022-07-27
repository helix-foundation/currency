/* eslint-disable no-console, no-underscore-dangle */

const { expect } = require('chai');
const { ethers } = require('hardhat');

const { BigNumber } = ethers;
const { signTypedData } = require('@metamask/eth-sig-util');

const { ecoFixture } = require('../utils/fixtures');
const time = require('../utils/time.ts');
const util = require('../../tools/test/util');
const {
  createPermitMessageData,
  permit,
  delegateBySig,
} = require('../../tools/test/permit');

describe('ECO [@group=1]', () => {
  const one = ethers.utils.parseEther('1');

  let accounts;
  let eco;
  let faucet;
  let policy;
  let timedPolicies;
  let proposedInflationMult;
  let inflationBlockNumber;

  before(async () => {
    accounts = await ethers.getSigners();
  });

  beforeEach(async () => {
    const bob = accounts[2];
    const digits1to9 = Math.floor(Math.random() * 900000000) + 100000000;
    const digits10to19 = Math.floor(Math.random() * 10000000000);
    proposedInflationMult = `${digits10to19}${digits1to9}`;
    const trustednodes = [await bob.getAddress()];

    ({ policy, eco, faucet, timedPolicies } = await ecoFixture(trustednodes));

    // enact a random amount of linear inflation for all tests
    const borda = await ethers.getContractAt(
      'CurrencyGovernance',
      await util.policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
      )
    );

    await borda.connect(bob).propose(0, 0, 0, 0, proposedInflationMult);
    await time.increase(3600 * 24 * 10.1);

    const bobvote = [
      ethers.utils.randomBytes(32),
      await bob.getAddress(),
      [await bob.getAddress()],
    ];
    const bobvotehash = ethers.utils.solidityKeccak256(
      ['bytes32', 'address', 'address[]'],
      [bobvote[0], bobvote[1], bobvote[2]]
    );
    await borda.connect(bob).commit(bobvotehash);
    await time.increase(3600 * 24 * 3);
    await borda.connect(bob).reveal(bobvote[0], bobvote[2]);
    await time.increase(3600 * 24 * 1);
    await borda.updateStage();
    await borda.compute();
    await time.increase(3600 * 24 * 1);
    await timedPolicies.incrementGeneration();
    await time.advanceBlock();
    inflationBlockNumber = await time.latestBlock();
    await time.advanceBlock();
    await time.advanceBlock();

    // console.log((await eco.getPastLinearInflation(inflationBlockNumber)).toString())
  });

  describe('total supply', () => {
    const amount = one.mul(100);

    beforeEach(async () => {
      await faucet.mint(await accounts[1].getAddress(), amount);
    });

    it('returns the total amount of tokens', async () => {
      const supply = await eco.totalSupply();

      expect(supply).to.equal(amount);
    });
  });

  describe('balanceOf', () => {
    const amount = one.mul(100);

    beforeEach(async () => {
      await faucet.mint(await accounts[1].getAddress(), amount);
    });

    context('when the requrested account has no tokens', () => {
      it('returns 0', async () => {
        const balance = await eco.balanceOf(await accounts[2].getAddress());

        expect(balance).to.equal(0);
      });
    });

    context('when there are tokens in the account', () => {
      it('returns the correct balance', async () => {
        const balance = await eco.balanceOf(await accounts[1].getAddress());

        expect(balance).to.equal(amount);
      });
    });
  });

  describe('transfer', () => {
    const amount = one.mul(1000);

    beforeEach(async () => {
      await faucet.mint(await accounts[1].getAddress(), amount);
    });

    context("when the sender doesn't have enough balance", () => {
      it('reverts', async () => {
        await expect(
          eco
            .connect(accounts[2])
            .transfer(await accounts[3].getAddress(), amount)
        ).to.be.revertedWith(
          'ERC20: transfer amount exceeds balance',
          eco.constructor
        );
      });
    });

    context('when the sender has enough balance', () => {
      it("reduces the sender's balance", async () => {
        const startBalance = await eco.balanceOf(
          await accounts[1].getAddress()
        );
        await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount);
        const endBalance = await eco.balanceOf(await accounts[1].getAddress());

        expect(endBalance.add(amount)).to.equal(startBalance);
      });

      it('increases the balance of the recipient', async () => {
        const startBalance = await eco.balanceOf(
          await accounts[2].getAddress()
        );
        await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount);
        const endBalance = await eco.balanceOf(await accounts[2].getAddress());

        expect(endBalance.sub(amount)).to.equal(startBalance);
      });

      it('emits a Transfer event', async () => {
        const recipient = await accounts[2].getAddress();
        await expect(eco.connect(accounts[1]).transfer(recipient, amount))
          .to.emit(eco, 'Transfer')
          .withArgs(
            await accounts[1].getAddress(),
            recipient,
            amount.toString()
          );
      });

      it('emits a BaseValueTransfer event', async () => {
        const recipient = await accounts[2].getAddress();
        const inflationMult = await eco.getPastLinearInflation(
          inflationBlockNumber
        );
        const gonsAmount = inflationMult.mul(amount);
        await expect(eco.connect(accounts[1]).transfer(recipient, amount))
          .to.emit(eco, 'BaseValueTransfer')
          .withArgs(
            await accounts[1].getAddress(),
            recipient,
            gonsAmount.toString()
          );
      });

      it('returns true', async () => {
        const result = await eco
          .connect(accounts[1])
          .callStatic.transfer(await accounts[2].getAddress(), amount);
        expect(result).to.be.true;
      });

      it('prevents a transfer to the 0 address', async () => {
        await expect(
          eco
            .connect(accounts[1])
            .transfer(ethers.constants.AddressZero, amount)
        ).to.be.revertedWith(
          'ERC20: transfer to the zero address',
          eco.constructor
        );
      });
    });
  });

  describe('burn', () => {
    const amount = one.mul(1000);

    beforeEach(async () => {
      await faucet.mint(await accounts[1].getAddress(), amount);
    });

    context("when the sender doesn't have enough balance", () => {
      it('reverts', async () => {
        await expect(
          eco.connect(accounts[2]).burn(await accounts[2].getAddress(), amount)
        ).to.be.revertedWith(
          'ERC20: burn amount exceeds balance',
          eco.constructor
        );
      });
    });

    context('when the sender is not the burning address', () => {
      it('reverts', async () => {
        await expect(
          eco.connect(accounts[2]).burn(await accounts[1].getAddress(), amount)
        ).to.be.revertedWith(
          'Caller not authorized to burn tokens',
          eco.constructor
        );
      });
    });

    context('when the sender has enough balance', () => {
      it("reduces the sender's balance", async () => {
        const startBalance = await eco.balanceOf(
          await accounts[1].getAddress()
        );
        await eco
          .connect(accounts[1])
          .burn(await accounts[1].getAddress(), amount);
        const endBalance = await eco.balanceOf(await accounts[1].getAddress());

        expect(endBalance.add(amount)).to.equal(startBalance);
      });

      it('reduces totalsupply', async () => {
        const startSupply = await eco.totalSupply();
        await eco
          .connect(accounts[1])
          .burn(await accounts[1].getAddress(), amount);
        const endSupply = await eco.totalSupply();

        expect(startSupply.sub(amount)).to.equal(endSupply);
      });

      it('emits a Transfer event', async () => {
        const source = await accounts[1].getAddress();
        await expect(eco.connect(accounts[1]).burn(source, amount))
          .to.emit(eco, 'Transfer')
          .withArgs(source, ethers.constants.AddressZero, amount.toString());
      });
    });
  });

  describe('approve/allowance', () => {
    let spender;
    let from;

    before(async () => {
      spender = await accounts[2].getAddress();
      from = accounts[1];
    });

    context('when the source address has enough balance', () => {
      const amount = one.mul(1000);

      it('emits an Approval event', async () => {
        await expect(eco.connect(from).approve(spender, amount)).to.emit(
          eco,
          'Approval'
        );
      });

      it('prevents an approve for the 0 address', async () => {
        await expect(
          eco.connect(from).approve(ethers.constants.AddressZero, amount)
        ).to.be.revertedWith(
          'ERC20: approve to the zero address',
          eco.constructor
        );
      });

      context('when there is no existing allowance', () => {
        it('sets the allowance', async () => {
          await eco.connect(from).approve(spender, amount);
          const allowance = await eco.allowance(
            await from.getAddress(),
            spender
          );
          expect(allowance).to.equal(amount);
        });
      });

      context('when there is a pre-existing allowance', () => {
        beforeEach(async () => {
          await eco.connect(from).approve(spender, amount.sub(50));
        });

        it('replaces the existing allowance', async () => {
          await eco.connect(from).approve(spender, amount);
          const allowance = await eco.allowance(
            await from.getAddress(),
            spender
          );

          expect(allowance).to.equal(amount);
        });

        it('emits the Approval event', async () => {
          await expect(eco.connect(from).approve(spender, amount)).to.emit(
            eco,
            'Approval'
          );
        });
      });
    });

    describe('permit', () => {
      const permitSpender = ethers.Wallet.createRandom();
      const owner = ethers.Wallet.createRandom();
      let chainId;

      before(async () => {
        ({ chainId } = await ethers.provider.getNetwork());
      });

      context('when the source address has enough balance', async () => {
        const amount = ethers.utils.parseEther('1').mul(1000);

        it('fails if signed from non-owner', async () => {
          const deadline = Math.floor(
            new Date().getTime() / 1000 + 86400 * 3000
          );
          const nonce = await eco.nonces(await owner.getAddress());

          const permitData = createPermitMessageData({
            name: await eco.name(),
            address: eco.address,
            owner: await owner.getAddress(),
            spender: await permitSpender.getAddress(),
            value: amount.toString(),
            nonce: nonce.toString(),
            chainId: chainId.toString(),
            deadline,
          });
          const sig = signTypedData({
            privateKey: Buffer.from(
              owner._signingKey().privateKey.slice(2),
              'hex'
            ),
            data: permitData,
            version: 'V4',
          });
          const { v, r, s } = ethers.utils.splitSignature(sig);

          await expect(
            eco.permit(
              await permitSpender.getAddress(),
              await owner.getAddress(),
              amount,
              deadline,
              v,
              r,
              s
            )
          ).to.be.revertedWith('ERC20Permit: invalid signature');
        });

        it('fails with invalid nonce', async () => {
          const deadline = Math.floor(
            new Date().getTime() / 1000 + 86400 * 3000
          );
          const nonce = await eco.nonces(await owner.getAddress());

          const permitData = createPermitMessageData({
            name: await eco.name(),
            address: eco.address,
            owner: await owner.getAddress(),
            spender: await permitSpender.getAddress(),
            value: amount.toString(),
            nonce: nonce + 1,
            chainId: chainId.toString(),
            deadline,
          });
          const sig = signTypedData({
            privateKey: Buffer.from(
              owner._signingKey().privateKey.slice(2),
              'hex'
            ),
            data: permitData,
            version: 'V4',
          });
          const { v, r, s } = ethers.utils.splitSignature(sig);

          await expect(
            eco.permit(
              await owner.getAddress(),
              await permitSpender.getAddress(),
              amount,
              deadline,
              v,
              r,
              s
            )
          ).to.be.revertedWith('ERC20Permit: invalid signature');
        });

        it('fails with invalid spender', async () => {
          const deadline = Math.floor(
            new Date().getTime() / 1000 + 86400 * 3000
          );
          const nonce = await eco.nonces(await owner.getAddress());

          const permitData = createPermitMessageData({
            name: await eco.name(),
            address: eco.address,
            owner: await owner.getAddress(),
            spender: await permitSpender.getAddress(),
            value: amount.toString(),
            nonce: nonce.toString(),
            chainId: chainId.toString(),
            deadline,
          });
          const sig = signTypedData({
            privateKey: Buffer.from(
              owner._signingKey().privateKey.slice(2),
              'hex'
            ),
            data: permitData,
            version: 'V4',
          });
          const { v, r, s } = ethers.utils.splitSignature(sig);

          await expect(
            eco.permit(
              await owner.getAddress(),
              await accounts[0].getAddress(),
              amount,
              deadline,
              v,
              r,
              s
            )
          ).to.be.revertedWith('ERC20Permit: invalid signature');
        });

        it('fails with invalid deadline', async () => {
          const deadline = Math.floor(new Date().getTime() / 1000 - 100);
          const nonce = await eco.nonces(await owner.getAddress());

          const permitData = createPermitMessageData({
            name: await eco.name(),
            address: eco.address,
            owner: await owner.getAddress(),
            spender: await permitSpender.getAddress(),
            value: amount.toString(),
            nonce: nonce.toString(),
            chainId: chainId.toString(),
            deadline,
          });
          const sig = signTypedData({
            privateKey: Buffer.from(
              owner._signingKey().privateKey.slice(2),
              'hex'
            ),
            data: permitData,
            version: 'V4',
          });
          const { v, r, s } = ethers.utils.splitSignature(sig);

          await expect(
            eco.permit(
              await owner.getAddress(),
              await permitSpender.getAddress(),
              amount,
              deadline,
              v,
              r,
              s
            )
          ).to.be.revertedWith('ERC20Permit: expired deadline');
        });

        it('fails with signature reuse', async () => {
          const deadline = Math.floor(
            new Date().getTime() / 1000 + 86400 * 3000
          );
          const nonce = await eco.nonces(await owner.getAddress());

          const permitData = createPermitMessageData({
            name: await eco.name(),
            address: eco.address,
            owner: await owner.getAddress(),
            spender: await permitSpender.getAddress(),
            value: amount.toString(),
            nonce: nonce.toString(),
            chainId: chainId.toString(),
            deadline,
          });
          const sig = signTypedData({
            privateKey: Buffer.from(
              owner._signingKey().privateKey.slice(2),
              'hex'
            ),
            data: permitData,
            version: 'V4',
          });
          const { v, r, s } = ethers.utils.splitSignature(sig);

          await expect(
            eco.permit(
              await owner.getAddress(),
              await permitSpender.getAddress(),
              amount,
              deadline,
              v,
              r,
              s
            )
          ).to.emit(eco, 'Approval');

          await expect(
            eco.permit(
              await owner.getAddress(),
              await permitSpender.getAddress(),
              amount,
              deadline,
              v,
              r,
              s
            )
          ).to.be.revertedWith('ERC20Permit: invalid signature');
        });

        it('emits an Approval event', async () => {
          await expect(
            permit(eco, owner, permitSpender, chainId, amount)
          ).to.emit(eco, 'Approval');
        });

        it('increments the nonce', async () => {
          const nonce = await eco.nonces(await owner.getAddress());
          await permit(eco, owner, permitSpender, chainId, amount);
          const nonceAfter = await eco.nonces(await owner.getAddress());
          expect(nonceAfter - nonce).to.equal(1);
        });

        it('returns proper domain separator', async () => {
          const domain = {
            name: await eco.name(),
            version: '1',
            chainId,
            verifyingContract: eco.address,
          };
          const expectedDomainSeparator =
            ethers.utils._TypedDataEncoder.hashDomain(domain);
          expect(await eco.DOMAIN_SEPARATOR()).to.equal(
            expectedDomainSeparator
          );
        });

        context('when there is no existing allowance', () => {
          it('sets the allowance', async () => {
            await expect(
              permit(eco, owner, permitSpender, chainId, amount)
            ).to.emit(eco, 'Approval');
            const allowance = await eco.allowance(
              await owner.getAddress(),
              await permitSpender.getAddress()
            );
            expect(allowance).to.equal(amount);
          });
        });

        context('when there is a pre-existing allowance', () => {
          beforeEach(async () => {
            await permit(eco, owner, permitSpender, chainId, amount.sub(50));
          });

          it('replaces the existing allowance', async () => {
            await permit(eco, owner, permitSpender, chainId, amount);
            const allowance = await eco.allowance(
              await owner.getAddress(),
              await permitSpender.getAddress()
            );

            expect(allowance).to.equal(amount);
          });

          it('emits the Approval event', async () => {
            await expect(
              permit(eco, owner, permitSpender, chainId, amount)
            ).to.emit(eco, 'Approval');
          });
        });
      });
    });

    context('when the source address does not have enough balance', () => {
      const amount = one.mul(1000);

      before(() => {
        from = accounts[1];
      });

      it('emits an Approval event', async () => {
        await expect(eco.connect(from).approve(spender, amount)).to.emit(
          eco,
          'Approval'
        );
      });

      context('when there is no existing allowance', () => {
        it('sets the allowance', async () => {
          await eco.connect(from).approve(spender, amount);
          const allowance = await eco.allowance(
            await from.getAddress(),
            spender
          );

          expect(allowance).to.equal(amount);
        });
      });

      context('when there is a pre-existing allowance', () => {
        beforeEach(async () => {
          await eco.connect(from).approve(spender, amount.sub(50));
        });

        it('replaces the existing allowance', async () => {
          await eco.connect(from).approve(spender, amount);
          const allowance = await eco.allowance(
            await from.getAddress(),
            spender
          );

          expect(allowance).to.equal(amount);
        });

        it('emits the Approval event', async () => {
          await expect(eco.connect(from).approve(spender, amount)).to.emit(
            eco,
            'Approval'
          );
        });
      });
    });
  });

  describe('transferFrom', () => {
    let from;
    let to;
    let authorized;
    let unauthorized;
    const balance = one.mul(1000);
    const allowance = one.mul(100);
    const allowanceParts = [one.mul(10), one.mul(50), one.mul(40)];

    before(() => {
      [, from, to, authorized, unauthorized] = accounts;
    });

    beforeEach(async () => {
      await faucet.mint(await from.getAddress(), balance);
      await eco.connect(from).approve(await authorized.getAddress(), allowance);
    });

    context('with an unauthorized account', () => {
      context('within the allowance', () => {
        it('reverts', async () => {
          await expect(
            eco
              .connect(unauthorized)
              .transferFrom(
                await from.getAddress(),
                await to.getAddress(),
                allowanceParts[0]
              )
          ).to.be.revertedWith('ERC20: transfer amount exceeds allowance');
        });
      });

      context('above the allowance', () => {
        it('reverts', async () => {
          await expect(
            eco
              .connect(unauthorized)
              .transferFrom(
                await from.getAddress(),
                await to.getAddress(),
                allowance.add(one.mul(10))
              )
          ).to.be.revertedWith('ERC20: transfer amount exceeds allowance');
        });
      });
    });

    context('with an authorized account', () => {
      context('within the allowance', () => {
        it('emits a Transfer event', async () => {
          await expect(
            eco
              .connect(authorized)
              .transferFrom(
                await from.getAddress(),
                await to.getAddress(),
                allowanceParts[0]
              )
          )
            .to.emit(eco, 'Transfer')
            .withArgs(
              await from.getAddress(),
              await to.getAddress(),
              allowanceParts[0].toString()
            );
        });

        it('adds to the recipient balance', async () => {
          const amount = allowanceParts[1];

          const startBalance = await eco.balanceOf(await to.getAddress());
          await eco
            .connect(authorized)
            .transferFrom(
              await from.getAddress(),
              await to.getAddress(),
              amount
            );
          const endBalance = await eco.balanceOf(await to.getAddress());

          expect(endBalance.sub(startBalance)).to.equal(amount);
        });

        it('subtracts from the source balance', async () => {
          const amount = allowanceParts[1];

          const startBalance = await eco.balanceOf(await from.getAddress());
          await eco
            .connect(authorized)
            .transferFrom(
              await from.getAddress(),
              await to.getAddress(),
              amount
            );
          const endBalance = await eco.balanceOf(await from.getAddress());

          expect(startBalance.sub(endBalance)).to.equal(amount);
        });

        it('decreases the allowance', async () => {
          const amount = allowanceParts[1];

          const startAllowance = await eco.allowance(
            await from.getAddress(),
            await authorized.getAddress()
          );
          await eco
            .connect(authorized)
            .transferFrom(
              await from.getAddress(),
              await to.getAddress(),
              amount
            );
          const endAllowance = await eco.allowance(
            await from.getAddress(),
            await authorized.getAddress()
          );

          expect(startAllowance.sub(endAllowance)).to.equal(amount);
        });

        it('allows multiple transfers', async () => {
          const startBalance = await eco.balanceOf(await from.getAddress());

          await Promise.all(
            allowanceParts.map(async (part) =>
              eco
                .connect(authorized)
                .transferFrom(
                  await from.getAddress(),
                  await to.getAddress(),
                  part
                )
            )
          );

          const endBalance = await eco.balanceOf(await from.getAddress());

          expect(startBalance.sub(endBalance)).to.equal(allowance);
        });

        context('with multiple transfers', () => {
          it('emits multiple Transfer events', async () => {
            await Promise.all(
              allowanceParts.map(async (part) => {
                await expect(
                  eco
                    .connect(authorized)
                    .transferFrom(
                      await from.getAddress(),
                      await to.getAddress(),
                      part
                    )
                )
                  .to.emit(eco, 'Transfer')
                  .withArgs(
                    await from.getAddress(),
                    await to.getAddress(),
                    part.toString()
                  );
              })
            );
          });
        });
      });

      context('above the allowance', () => {
        context('with a single transfer', () => {
          it('reverts', async () => {
            await expect(
              eco
                .connect(authorized)
                .transferFrom(
                  await from.getAddress(),
                  await to.getAddress(),
                  allowance.add(1)
                )
            ).to.be.revertedWith('ERC20: transfer amount exceeds allowance');
          });
        });

        context('with multiple transfers', () => {
          it("can't exceed the allowance", async () => {
            const extra = 1;

            await Promise.all(
              allowanceParts.map(async (part) =>
                eco
                  .connect(authorized)
                  .transferFrom(
                    await from.getAddress(),
                    await to.getAddress(),
                    part
                  )
              )
            );

            await expect(
              eco
                .connect(authorized)
                .transferFrom(
                  await from.getAddress(),
                  await to.getAddress(),
                  extra
                )
            ).to.be.revertedWith('ERC20: transfer amount exceeds allowance');
          });
        });
      });

      context('when transferring 0', () => {
        it('emits a Transfer event', async () => {
          await expect(
            eco
              .connect(authorized)
              .transferFrom(await from.getAddress(), await to.getAddress(), 0)
          )
            .to.emit(eco, 'Transfer')
            .withArgs(await from.getAddress(), await to.getAddress(), '0');
        });

        it('does not decrease the allowance', async () => {
          const startAllowance = await eco.allowance(
            await from.getAddress(),
            await authorized.getAddress()
          );
          await eco
            .connect(authorized)
            .transferFrom(await from.getAddress(), await to.getAddress(), 0);
          const endAllowance = await eco.allowance(
            await from.getAddress(),
            await authorized.getAddress()
          );

          expect(endAllowance).to.equal(startAllowance);
        });

        it('does not change the sender balance', async () => {
          const startBalance = await eco.balanceOf(await from.getAddress());
          await eco
            .connect(authorized)
            .transferFrom(await from.getAddress(), await to.getAddress(), 0);
          const endBalance = await eco.balanceOf(await from.getAddress());

          expect(endBalance).to.equal(startBalance);
        });

        it('does not change the recipient balance', async () => {
          const startBalance = await eco.balanceOf(await to.getAddress());
          await eco
            .connect(authorized)
            .transferFrom(await from.getAddress(), await to.getAddress(), 0);
          const endBalance = await eco.balanceOf(await to.getAddress());

          expect(endBalance).to.equal(startBalance);
        });
      });
    });
  });

  describe('Events from BalanceStore', () => {
    const amount = one.mul(1000);

    it('emits Transfer when minting', async () => {
      await expect(faucet.mint(await accounts[1].getAddress(), amount))
        .to.emit(eco, 'Transfer')
        .withArgs(
          ethers.constants.AddressZero,
          await accounts[1].getAddress(),
          amount.toString()
        );
    });

    it('emits Transfer when burning', async () => {
      await faucet.mint(await accounts[1].getAddress(), amount);
      const burnAmount = one.mul(100);
      await expect(
        eco
          .connect(accounts[1])
          .burn(await accounts[1].getAddress(), burnAmount)
      )
        .to.emit(eco, 'Transfer')
        .withArgs(
          await accounts[1].getAddress(),
          ethers.constants.AddressZero,
          burnAmount.toString()
        );
    });
  });

  describe('Metadata', () => {
    it('has the standard 18 decimals', async () => {
      const decimals = await eco.decimals();
      expect(decimals).to.be.equal(18);
    });
  });

  describe('Checkpoint data', () => {
    let from;
    const deposit = one.mul(1000);
    const balance = deposit.mul(2);

    before(() => {
      from = accounts[1];
    });

    beforeEach(async () => {
      await faucet.mint(await from.getAddress(), deposit);
      await faucet.mint(await from.getAddress(), deposit);
    });

    it('can get a checkpoint value', async () => {
      const inflationMult = await eco.getPastLinearInflation(
        inflationBlockNumber
      );
      const checkpoint = await eco.checkpoints(await from.getAddress(), 1);
      expect(checkpoint.value).to.be.equal(inflationMult.mul(balance));
    });

    it('can get the number of checkpoints', async () => {
      const numCheckpoints = await eco.numCheckpoints(await from.getAddress());
      expect(numCheckpoints).to.be.equal(2);
    });

    it('can get the internal votes for an account', async () => {
      const inflationMult = await eco.getPastLinearInflation(
        inflationBlockNumber
      );
      const votes = await eco.getVotingGons(await from.getAddress());
      expect(votes).to.be.equal(inflationMult.mul(balance));
    });

    it('cannot get the internal votes for an account until the block requested has been mined', async () => {
      await expect(
        eco
          .connect(from)
          .getPastVotingGons(
            await from.getAddress(),
            (await time.latestBlock()) + 1
          )
      ).to.be.revertedWith(
        'VoteCheckpoints: block not yet mined',
        eco.constructor
      );
    });

    it('cannot get the past supply until the block requestsed has been mined', async () => {
      await expect(
        eco.connect(from).getPastTotalSupply((await time.latestBlock()) + 1)
      ).to.be.revertedWith(
        'VoteCheckpoints: block not yet mined',
        eco.constructor
      );
    });
  });

  describe('increase and decrease allowance', () => {
    let from;
    let authorized;
    const balance = one.mul(1000);
    const allowanceAmount = one.mul(100);
    const increment = one.mul(10);

    before(() => {
      [, from, authorized] = accounts;
    });

    beforeEach(async () => {
      await faucet.mint(await from.getAddress(), balance);
      await eco
        .connect(from)
        .approve(await authorized.getAddress(), allowanceAmount);
    });

    context('we can increase the allowance', () => {
      it('increases the allowance', async () => {
        await eco
          .connect(from)
          .increaseAllowance(await authorized.getAddress(), increment);
        const allowance = await eco.allowance(
          await from.getAddress(),
          await authorized.getAddress()
        );
        expect(allowance).to.be.equal(allowanceAmount.add(increment));
      });
    });

    context('we can decrease the allowance', () => {
      it('decreases the allowance', async () => {
        await eco
          .connect(from)
          .decreaseAllowance(await authorized.getAddress(), increment);
        const allowance = await eco.allowance(
          await from.getAddress(),
          await authorized.getAddress()
        );
        expect(allowance).to.be.equal(allowanceAmount.sub(increment));
      });

      it('cant decreases the allowance into negative values', async () => {
        await expect(
          eco
            .connect(from)
            .decreaseAllowance(
              await authorized.getAddress(),
              allowanceAmount.add(1)
            )
        ).to.be.revertedWith(
          'ERC20: decreased allowance below zero',
          eco.constructor
        );
      });
    });
  });

  describe('delegation', () => {
    const amount = one.mul(1000);
    let voteAmount;

    beforeEach(async () => {
      await faucet.mint(await accounts[1].getAddress(), amount);
      await faucet.mint(await accounts[2].getAddress(), amount);
      await faucet.mint(await accounts[3].getAddress(), amount);
      await faucet.mint(await accounts[4].getAddress(), amount);
      await eco.connect(accounts[3]).enableDelegation();
      await eco.connect(accounts[4]).enableDelegation();

      voteAmount = BigNumber.from(proposedInflationMult).mul(amount);
    });

    context('delegate', () => {
      it('correct votes when delegated', async () => {
        const tx1 = await eco
          .connect(accounts[1])
          .delegate(await accounts[3].getAddress());
        const receipt1 = await tx1.wait();
        console.log(receipt1.gasUsed);
        expect(
          await eco.getVotingGons(await accounts[3].getAddress())
        ).to.equal(voteAmount.mul(2));

        const tx2 = await eco
          .connect(accounts[1])
          .delegate(await accounts[4].getAddress());
        const receipt2 = await tx2.wait();
        console.log(receipt2.gasUsed);
        expect(
          await eco.getVotingGons(await accounts[3].getAddress())
        ).to.equal(voteAmount);
        expect(
          await eco.getVotingGons(await accounts[4].getAddress())
        ).to.equal(voteAmount.mul(2));
      });

      it('does not allow delegation if not enabled', async () => {
        await expect(
          eco.connect(accounts[1]).delegate(await accounts[5].getAddress())
        ).to.be.revertedWith('Primary delegates must enable delegation');
      });

      it('does not allow delegation to yourself', async () => {
        await expect(
          eco.connect(accounts[1]).delegate(await accounts[1].getAddress())
        ).to.be.revertedWith(
          'Use undelegate instead of delegating to yourself'
        );
      });

      it('does not allow delegation if you are a delegatee', async () => {
        await expect(
          eco.connect(accounts[3]).delegate(await accounts[4].getAddress())
        ).to.be.revertedWith(
          'Cannot delegate if you have enabled primary delegation to yourself'
        );
      });
    });

    context('undelegate', () => {
      it('correct state when undelegated after delegating', async () => {
        await eco.connect(accounts[1]).delegate(await accounts[3].getAddress());

        const tx2 = await eco.connect(accounts[1]).undelegate();
        const receipt2 = await tx2.wait();
        console.log(receipt2.gasUsed);

        const votes1 = await eco.getVotingGons(await accounts[1].getAddress());
        expect(votes1).to.equal(voteAmount);
        const votes2 = await eco.getVotingGons(await accounts[3].getAddress());
        expect(votes2).to.equal(voteAmount);
      });
    });

    context('isOwnDelegate', () => {
      it('correct state when delegating and undelegating', async () => {
        expect(await eco.isOwnDelegate(await accounts[1].getAddress())).to.be
          .true;

        await eco.connect(accounts[1]).delegate(await accounts[3].getAddress());
        expect(await eco.isOwnDelegate(await accounts[1].getAddress())).to.be
          .false;

        await eco.connect(accounts[1]).undelegate();
        expect(await eco.isOwnDelegate(await accounts[1].getAddress())).to.be
          .true;
      });
    });

    context('getPrimaryDelegate', () => {
      it('correct state when delegating and undelegating', async () => {
        expect(
          await eco.getPrimaryDelegate(await accounts[1].getAddress())
        ).to.equal(await accounts[1].getAddress());

        await eco.connect(accounts[1]).delegate(await accounts[3].getAddress());
        expect(
          await eco.getPrimaryDelegate(await accounts[1].getAddress())
        ).to.equal(await accounts[3].getAddress());

        await eco.connect(accounts[1]).undelegate();
        expect(
          await eco.getPrimaryDelegate(await accounts[1].getAddress())
        ).to.equal(await accounts[1].getAddress());
      });
    });

    context('delegate then transfer', () => {
      it('sender delegated', async () => {
        await eco.connect(accounts[1]).delegate(await accounts[3].getAddress());
        await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount);
        expect(
          await eco.getVotingGons(await accounts[1].getAddress())
        ).to.equal(0);
        expect(
          await eco.getVotingGons(await accounts[2].getAddress())
        ).to.equal(voteAmount.mul(2));
        expect(
          await eco.getVotingGons(await accounts[3].getAddress())
        ).to.equal(voteAmount);
      });

      it('receiver delegated', async () => {
        await eco.connect(accounts[2]).delegate(await accounts[4].getAddress());
        await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount);
        expect(
          await eco.getVotingGons(await accounts[1].getAddress())
        ).to.equal(0);
        expect(
          await eco.getVotingGons(await accounts[2].getAddress())
        ).to.equal(0);
        expect(
          await eco.getVotingGons(await accounts[4].getAddress())
        ).to.equal(voteAmount.mul(3));
      });

      it('both delegated', async () => {
        await eco.connect(accounts[1]).delegate(await accounts[3].getAddress());
        await eco.connect(accounts[2]).delegate(await accounts[4].getAddress());
        await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount);
        expect(
          await eco.getVotingGons(await accounts[1].getAddress())
        ).to.equal(0);
        expect(
          await eco.getVotingGons(await accounts[2].getAddress())
        ).to.equal(0);
        expect(
          await eco.getVotingGons(await accounts[3].getAddress())
        ).to.equal(voteAmount);
        expect(
          await eco.getVotingGons(await accounts[4].getAddress())
        ).to.equal(voteAmount.mul(3));
      });
    });

    context('transfer gas testing', () => {
      it('no delegations', async () => {
        const tx = await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount);
        const receipt = await tx.wait();
        console.log(receipt.gasUsed);
      });

      it('sender delegated', async () => {
        await eco.connect(accounts[1]).delegate(await accounts[3].getAddress());
        const tx = await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount);
        const receipt = await tx.wait();
        console.log(receipt.gasUsed);
      });

      it('receiver delegated', async () => {
        await eco.connect(accounts[2]).delegate(await accounts[4].getAddress());
        const tx = await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount);
        const receipt = await tx.wait();
        console.log(receipt.gasUsed);
      });

      it('both delegated', async () => {
        await eco.connect(accounts[1]).delegate(await accounts[3].getAddress());
        await eco.connect(accounts[2]).delegate(await accounts[4].getAddress());
        const tx = await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount);
        const receipt = await tx.wait();
        console.log(receipt.gasUsed);
      });
    });
  });

  describe('delegation by signature', () => {
    const amount = one.mul(1000);
    const delegator = ethers.Wallet.createRandom().connect(ethers.provider);
    const nonDelegatee = ethers.Wallet.createRandom().connect(ethers.provider);
    const delegateTransferRecipient = ethers.Wallet.createRandom().connect(
      ethers.provider
    );
    const delegatee = ethers.Wallet.createRandom().connect(ethers.provider);
    const otherDelegatee = ethers.Wallet.createRandom().connect(
      ethers.provider
    );
    let voteAmount;
    let chainId;

    before(async () => {
      ({ chainId } = await ethers.provider.getNetwork());
    });

    beforeEach(async () => {
      await accounts[5].sendTransaction({
        to: await delegator.getAddress(),
        value: one.mul(100),
      });
      await accounts[6].sendTransaction({
        to: await delegatee.getAddress(),
        value: one.mul(100),
      });
      await accounts[7].sendTransaction({
        to: await delegateTransferRecipient.getAddress(),
        value: one.mul(100),
      });
      await accounts[8].sendTransaction({
        to: await otherDelegatee.getAddress(),
        value: one.mul(100),
      });
      await faucet.mint(await delegator.getAddress(), amount);
      await faucet.mint(await delegateTransferRecipient.getAddress(), amount);
      await faucet.mint(await delegatee.getAddress(), amount);
      await faucet.mint(await otherDelegatee.getAddress(), amount);
      await eco.connect(delegatee).enableDelegation({ gasLimit: 1000000 });
      await eco.connect(otherDelegatee).enableDelegation({ gasLimit: 1000000 });

      voteAmount = BigNumber.from(proposedInflationMult).mul(amount);
    });

    context('delegateBySig', () => {
      it('correct votes when delegated', async () => {
        const tx1 = await delegateBySig(
          eco,
          delegator,
          delegatee,
          chainId,
          accounts[0],
          {}
        );
        const receipt1 = await tx1.wait();
        console.log(receipt1.gasUsed);
        expect(await eco.getVotingGons(await delegatee.getAddress())).to.equal(
          voteAmount.mul(2)
        );

        const tx2 = await delegateBySig(
          eco,
          delegator,
          otherDelegatee,
          chainId,
          accounts[0],
          {}
        );
        const receipt2 = await tx2.wait();
        console.log(receipt2.gasUsed);
        expect(await eco.getVotingGons(await delegatee.getAddress())).to.equal(
          voteAmount
        );
        expect(
          await eco.getVotingGons(await otherDelegatee.getAddress())
        ).to.equal(voteAmount.mul(2));
      });

      it('does not allow delegation if not enabled', async () => {
        await expect(
          delegateBySig(eco, delegator, nonDelegatee, chainId, accounts[0], {})
        ).to.be.revertedWith('Primary delegates must enable delegation');
      });

      it('does not allow delegation to yourself', async () => {
        await expect(
          delegateBySig(eco, delegator, delegator, chainId, delegator, {})
        ).to.be.revertedWith('Do not delegate to yourself');
      });

      it('allows executing own delegation', async () => {
        await delegateBySig(eco, delegator, delegatee, chainId, delegatee, {});
        expect(await eco.getVotingGons(await delegatee.getAddress())).to.equal(
          voteAmount.mul(2)
        );
      });

      it('allows delegation by signer', async () => {
        await delegateBySig(eco, delegator, delegatee, chainId, delegator, {});
        expect(await eco.getVotingGons(await delegatee.getAddress())).to.equal(
          voteAmount.mul(2)
        );
      });

      it('does not allow delegation if you are a delegatee', async () => {
        await expect(
          delegateBySig(eco, delegatee, otherDelegatee, chainId, delegatee, {})
        ).to.be.revertedWith(
          'Cannot delegate if you have enabled primary delegation to yourself'
        );
      });

      it('does not allow delegation after deadline', async () => {
        await expect(
          delegateBySig(eco, delegator, delegatee, chainId, accounts[0], {
            deadline: Math.floor(new Date().getTime() / 1000 - 5),
          })
        ).to.be.revertedWith('DelegatePermit: expired deadline');
      });

      it('does not allow non-delegator signature', async () => {
        await expect(
          delegateBySig(eco, delegator, delegatee, chainId, accounts[0], {
            signer: delegateTransferRecipient,
          })
        ).to.be.revertedWith('DelegatePermit: invalid signature');
      });

      it('does not allow non-monotonic nonce', async () => {
        await expect(
          delegateBySig(eco, delegator, delegatee, chainId, accounts[0], {
            nonce: 100,
          })
        ).to.be.revertedWith('DelegatePermit: invalid signature');
      });

      it('does not allow nonce reuse', async () => {
        await delegateBySig(eco, delegator, delegatee, chainId, accounts[0], {
          nonce: 0,
        });
        await expect(
          delegateBySig(eco, delegator, delegatee, chainId, accounts[0], {
            nonce: 0,
          })
        ).to.be.revertedWith('DelegatePermit: invalid signature');
      });
    });

    context('undelegate', () => {
      it('correct state when undelegated after delegating', async () => {
        await delegateBySig(eco, delegator, delegatee, chainId, delegatee, {});

        const tx2 = await eco
          .connect(delegator)
          .undelegate({ gasLimit: 1000000 });
        const receipt2 = await tx2.wait();
        console.log(receipt2.gasUsed);

        const votes1 = await eco.getVotingGons(await delegator.getAddress());
        expect(votes1).to.equal(voteAmount);
        const votes2 = await eco.getVotingGons(await delegatee.getAddress());
        expect(votes2).to.equal(voteAmount);
      });
    });

    context('isOwnDelegate', () => {
      it('correct state when delegating and undelegating', async () => {
        expect(await eco.isOwnDelegate(await delegator.getAddress())).to.be
          .true;

        await delegateBySig(eco, delegator, delegatee, chainId, delegatee, {});
        expect(await eco.isOwnDelegate(await delegator.getAddress())).to.be
          .false;

        await eco.connect(delegator).undelegate({ gasLimit: 1000000 });
        expect(await eco.isOwnDelegate(await delegator.getAddress())).to.be
          .true;
      });
    });

    context('getPrimaryDelegate', () => {
      it('correct state when delegating and undelegating', async () => {
        expect(
          await eco.getPrimaryDelegate(await delegator.getAddress())
        ).to.equal(await delegator.getAddress());

        await delegateBySig(eco, delegator, delegatee, chainId, delegatee, {});
        expect(
          await eco.getPrimaryDelegate(await delegator.getAddress())
        ).to.equal(await delegatee.getAddress());

        await eco.connect(delegator).undelegate({ gasLimit: 1000000 });
        expect(
          await eco.getPrimaryDelegate(await delegator.getAddress())
        ).to.equal(await delegator.getAddress());
      });
    });

    context('delegate then transfer', () => {
      it('sender delegated', async () => {
        await delegateBySig(eco, delegator, delegatee, chainId, delegatee, {});
        await eco
          .connect(delegator)
          .transfer(await delegateTransferRecipient.getAddress(), amount, {
            gasLimit: 1000000,
          });
        expect(await eco.getVotingGons(await delegator.getAddress())).to.equal(
          0
        );
        expect(
          await eco.getVotingGons(await delegateTransferRecipient.getAddress())
        ).to.equal(voteAmount.mul(2));
        expect(await eco.getVotingGons(await delegatee.getAddress())).to.equal(
          voteAmount
        );
      });

      it('receiver delegated', async () => {
        await delegateBySig(
          eco,
          delegateTransferRecipient,
          otherDelegatee,
          chainId,
          delegateTransferRecipient,
          {}
        );
        await eco
          .connect(delegator)
          .transfer(await delegateTransferRecipient.getAddress(), amount, {
            gasLimit: 1000000,
          });
        expect(await eco.getVotingGons(await delegator.getAddress())).to.equal(
          0
        );
        expect(
          await eco.getVotingGons(await delegateTransferRecipient.getAddress())
        ).to.equal(0);
        expect(
          await eco.getVotingGons(await otherDelegatee.getAddress())
        ).to.equal(voteAmount.mul(3));
      });

      it('both delegated', async () => {
        await delegateBySig(eco, delegator, delegatee, chainId, delegatee, {});
        await delegateBySig(
          eco,
          delegateTransferRecipient,
          otherDelegatee,
          chainId,
          delegateTransferRecipient,
          {}
        );
        await eco
          .connect(delegator)
          .transfer(await delegateTransferRecipient.getAddress(), amount, {
            gasLimit: 1000000,
          });
        expect(await eco.getVotingGons(await delegator.getAddress())).to.equal(
          0
        );
        expect(
          await eco.getVotingGons(await delegateTransferRecipient.getAddress())
        ).to.equal(0);
        expect(await eco.getVotingGons(await delegatee.getAddress())).to.equal(
          voteAmount
        );
        expect(
          await eco.getVotingGons(await otherDelegatee.getAddress())
        ).to.equal(voteAmount.mul(3));
      });
    });
  });

  describe('partial delegation', () => {
    const amount = one.mul(1000);
    let voteAmount;

    beforeEach(async () => {
      await faucet.mint(await accounts[1].getAddress(), amount);
      await faucet.mint(await accounts[2].getAddress(), amount);
      await faucet.mint(await accounts[3].getAddress(), amount);
      await faucet.mint(await accounts[4].getAddress(), amount);
      await eco.connect(accounts[3]).enableDelegation();
      await eco.connect(accounts[4]).enableDelegation();

      voteAmount = BigNumber.from(proposedInflationMult).mul(amount);
    });

    context('delegateAmount', () => {
      it('correct votes when delegated', async () => {
        const tx1 = await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[3].getAddress(), voteAmount.div(2));
        const receipt1 = await tx1.wait();
        console.log(receipt1.gasUsed);
        expect(
          await eco.getVotingGons(await accounts[1].getAddress())
        ).to.equal(voteAmount.div(2));
        expect(
          await eco.getVotingGons(await accounts[3].getAddress())
        ).to.equal(voteAmount.div(2).mul(3));

        const tx2 = await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[4].getAddress(), voteAmount.div(4));
        const receipt2 = await tx2.wait();
        console.log(receipt2.gasUsed);
        expect(
          await eco.getVotingGons(await accounts[1].getAddress())
        ).to.equal(voteAmount.div(4));
        expect(
          await eco.getVotingGons(await accounts[3].getAddress())
        ).to.equal(voteAmount.div(2).mul(3));
        expect(
          await eco.getVotingGons(await accounts[4].getAddress())
        ).to.equal(voteAmount.div(4).mul(5));
      });

      it('does not allow delegation to yourself', async () => {
        await expect(
          eco
            .connect(accounts[1])
            .delegateAmount(await accounts[1].getAddress(), voteAmount.div(5))
        ).to.be.revertedWith('Do not delegate to yourself');
      });

      it('does not allow delegation if you are a delegatee', async () => {
        await expect(
          eco
            .connect(accounts[3])
            .delegateAmount(await accounts[4].getAddress(), voteAmount.div(2))
        ).to.be.revertedWith(
          'Cannot delegate if you have enabled primary delegation to yourself'
        );
      });

      it('does not allow you to delegate more than your balance', async () => {
        await expect(
          eco
            .connect(accounts[1])
            .delegateAmount(await accounts[4].getAddress(), voteAmount.mul(3))
        ).to.be.revertedWith(
          'Must have an undelegated amount available to cover delegation'
        );

        await eco
          .connect(accounts[1])
          .delegateAmount(
            await accounts[4].getAddress(),
            voteAmount.mul(2).div(3)
          );

        await expect(
          eco
            .connect(accounts[1])
            .delegateAmount(await accounts[3].getAddress(), voteAmount.div(2))
        ).to.be.revertedWith(
          'Must have an undelegated amount available to cover delegation'
        );
      });

      it('having a primary delegate means you cannot delegate an amount', async () => {
        await eco.connect(accounts[1]).delegate(await accounts[4].getAddress());

        await expect(
          eco
            .connect(accounts[1])
            .delegateAmount(
              await accounts[3].getAddress(),
              voteAmount.div(1000000)
            )
        ).to.be.revertedWith(
          'Must have an undelegated amount available to cover delegation'
        );
      });

      it('having delegated an amount does not allow you to full delegate', async () => {
        await eco
          .connect(accounts[1])
          .delegateAmount(
            await accounts[4].getAddress(),
            voteAmount.div(1000000)
          );

        await expect(
          eco.connect(accounts[1]).delegate(await accounts[3].getAddress())
        ).to.be.revertedWith(
          'Must have an undelegated amount available to cover delegation'
        );
        await expect(
          eco.connect(accounts[1]).delegate(await accounts[4].getAddress())
        ).to.be.revertedWith(
          'Must have an undelegated amount available to cover delegation'
        );
      });
    });

    context('undelegate', () => {
      it('correct state when undelegated after delegating', async () => {
        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[3].getAddress(), voteAmount.div(2));
        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[4].getAddress(), voteAmount.div(4));

        const tx1 = await eco
          .connect(accounts[1])
          .undelegateFromAddress(await accounts[4].getAddress());
        const receipt1 = await tx1.wait();
        console.log(receipt1.gasUsed);

        expect(
          await eco
            .connect(accounts[1])
            .getVotingGons(await accounts[1].getAddress())
        ).to.equal(voteAmount.div(2));
        expect(
          await eco
            .connect(accounts[1])
            .getVotingGons(await accounts[3].getAddress())
        ).to.equal(voteAmount.div(2).mul(3));
        expect(
          await eco
            .connect(accounts[1])
            .getVotingGons(await accounts[4].getAddress())
        ).to.equal(voteAmount);

        const tx2 = await eco
          .connect(accounts[1])
          .undelegateFromAddress(await accounts[3].getAddress());
        const receipt2 = await tx2.wait();
        console.log(receipt2.gasUsed);

        expect(
          await eco
            .connect(accounts[1])
            .getVotingGons(await accounts[1].getAddress())
        ).to.equal(voteAmount);
        expect(
          await eco
            .connect(accounts[1])
            .getVotingGons(await accounts[3].getAddress())
        ).to.equal(voteAmount);
        expect(
          await eco
            .connect(accounts[1])
            .getVotingGons(await accounts[4].getAddress())
        ).to.equal(voteAmount);
      });
    });

    context('partial undelegateAmountFromAddress', () => {
      it('can undelegate partially', async () => {
        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[3].getAddress(), voteAmount.div(2));
        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[4].getAddress(), voteAmount.div(4));

        const tx1 = await eco
          .connect(accounts[1])
          .undelegateAmountFromAddress(
            await accounts[4].getAddress(),
            voteAmount.div(8)
          );
        const receipt1 = await tx1.wait();
        console.log(receipt1.gasUsed);

        expect(
          await eco
            .connect(accounts[1])
            .getVotingGons(await accounts[1].getAddress())
        ).to.equal(voteAmount.div(8).mul(3));
        expect(
          await eco
            .connect(accounts[1])
            .getVotingGons(await accounts[3].getAddress())
        ).to.equal(voteAmount.div(2).mul(3));
        expect(
          await eco
            .connect(accounts[1])
            .getVotingGons(await accounts[4].getAddress())
        ).to.equal(voteAmount.div(8).mul(9));

        const tx2 = await eco
          .connect(accounts[1])
          .undelegateAmountFromAddress(
            await accounts[3].getAddress(),
            voteAmount.div(4)
          );
        const receipt2 = await tx2.wait();
        console.log(receipt2.gasUsed);

        expect(
          await eco
            .connect(accounts[1])
            .getVotingGons(await accounts[1].getAddress())
        ).to.equal(voteAmount.div(8).mul(5));
        expect(
          await eco
            .connect(accounts[1])
            .getVotingGons(await accounts[3].getAddress())
        ).to.equal(voteAmount.div(4).mul(5));
        expect(
          await eco
            .connect(accounts[1])
            .getVotingGons(await accounts[4].getAddress())
        ).to.equal(voteAmount.div(8).mul(9));
      });

      it('reverts if amount is too high', async () => {
        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[3].getAddress(), voteAmount.div(2));

        await expect(
          eco
            .connect(accounts[1])
            .undelegateAmountFromAddress(
              await accounts[3].getAddress(),
              voteAmount
            )
        ).to.be.revertedWith('amount not available to undelegate');
      });

      it('reverts if you try to undelegateAmountFromAddress as a primary delegator', async () => {
        await eco.connect(accounts[1]).delegate(await accounts[3].getAddress());

        await expect(
          eco
            .connect(accounts[1])
            .undelegateAmountFromAddress(
              await accounts[3].getAddress(),
              voteAmount.div(2)
            )
        ).to.be.revertedWith(
          'undelegating amounts is only available for partial delegators'
        );
      });
    });

    context('isOwnDelegate', () => {
      it('correct state when delegating and undelegating', async () => {
        expect(await eco.isOwnDelegate(await accounts[1].getAddress())).to.be
          .true;

        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[2].getAddress(), voteAmount.div(4));
        expect(await eco.isOwnDelegate(await accounts[1].getAddress())).to.be
          .false;

        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[3].getAddress(), voteAmount.div(4));
        expect(await eco.isOwnDelegate(await accounts[1].getAddress())).to.be
          .false;

        await eco
          .connect(accounts[1])
          .undelegateFromAddress(await accounts[3].getAddress());
        expect(await eco.isOwnDelegate(await accounts[1].getAddress())).to.be
          .false;

        await eco
          .connect(accounts[1])
          .undelegateFromAddress(await accounts[2].getAddress());
        expect(await eco.isOwnDelegate(await accounts[1].getAddress())).to.be
          .true;
      });
    });

    context('getPrimaryDelegate', () => {
      it('delegateAmount does not give you a primary delegate', async () => {
        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[3].getAddress(), voteAmount.div(2));
        expect(
          await eco.getPrimaryDelegate(await accounts[1].getAddress())
        ).to.equal(await accounts[1].getAddress());
      });
    });

    context('delegate then transfer', () => {
      it('sender delegated with enough to cover', async () => {
        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[3].getAddress(), voteAmount.div(2));
        await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount.div(2));
        expect(
          await eco.getVotingGons(await accounts[1].getAddress())
        ).to.equal(0);
        expect(
          await eco.getVotingGons(await accounts[2].getAddress())
        ).to.equal(voteAmount.mul(3).div(2));
        expect(
          await eco.getVotingGons(await accounts[3].getAddress())
        ).to.equal(voteAmount.mul(3).div(2));
      });

      it('sender delegated without enough to cover', async () => {
        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[3].getAddress(), voteAmount.div(2));
        await expect(
          eco
            .connect(accounts[1])
            .transfer(await accounts[2].getAddress(), amount)
        ).to.be.revertedWith(
          'Delegation too complicated to transfer. Undelegate and simplify before trying again'
        );
      });

      it('receiver delegated', async () => {
        await eco
          .connect(accounts[2])
          .delegateAmount(await accounts[4].getAddress(), voteAmount.div(2));
        await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount.div(2));
        expect(
          await eco.getVotingGons(await accounts[1].getAddress())
        ).to.equal(voteAmount.div(2));
        expect(
          await eco.getVotingGons(await accounts[2].getAddress())
        ).to.equal(voteAmount);
        expect(
          await eco.getVotingGons(await accounts[4].getAddress())
        ).to.equal(voteAmount.mul(3).div(2));

        await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount.div(2));
        expect(
          await eco.getVotingGons(await accounts[1].getAddress())
        ).to.equal(0);
        expect(
          await eco.getVotingGons(await accounts[2].getAddress())
        ).to.equal(voteAmount.mul(3).div(2));
        expect(
          await eco.getVotingGons(await accounts[4].getAddress())
        ).to.equal(voteAmount.mul(3).div(2));
      });

      it('both delegated', async () => {
        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[3].getAddress(), voteAmount.div(2));
        await eco
          .connect(accounts[2])
          .delegateAmount(await accounts[4].getAddress(), voteAmount.div(4));
        await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount.div(2));
        expect(
          await eco.getVotingGons(await accounts[1].getAddress())
        ).to.equal(0);
        expect(
          await eco.getVotingGons(await accounts[2].getAddress())
        ).to.equal(voteAmount.mul(5).div(4));
        expect(
          await eco.getVotingGons(await accounts[3].getAddress())
        ).to.equal(voteAmount.mul(3).div(2));
        expect(
          await eco.getVotingGons(await accounts[4].getAddress())
        ).to.equal(voteAmount.mul(5).div(4));
      });
    });

    context('transfer gas testing', () => {
      it('sender delegated', async () => {
        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[3].getAddress(), voteAmount.div(2));
        const tx = await eco
          .connect(accounts[1])
          .transfer(await accounts[3].getAddress(), amount.div(3));
        const receipt = await tx.wait();
        console.log(receipt.gasUsed);
      });

      it('receiver delegated', async () => {
        await eco
          .connect(accounts[2])
          .delegateAmount(await accounts[4].getAddress(), voteAmount.div(2));
        const tx = await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount);
        const receipt = await tx.wait();
        console.log(receipt.gasUsed);
      });

      it('both delegated', async () => {
        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[3].getAddress(), voteAmount.div(2));
        await eco
          .connect(accounts[2])
          .delegateAmount(await accounts[4].getAddress(), voteAmount.div(2));
        const tx = await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount.div(3));
        const receipt = await tx.wait();
        console.log(receipt.gasUsed);
      });

      it('both delegated with receiver primary delegate', async () => {
        await eco
          .connect(accounts[1])
          .delegateAmount(await accounts[3].getAddress(), voteAmount.div(2));
        await eco.connect(accounts[2]).delegate(await accounts[4].getAddress());
        const tx = await eco
          .connect(accounts[1])
          .transfer(await accounts[2].getAddress(), amount.div(3));
        const receipt = await tx.wait();
        console.log(receipt.gasUsed);
      });
    });
  });

  context('Pausable', () => {
    it('is not paused', async () => {
      expect(await eco.paused()).to.be.false;
    });

    it('cannot be paused by random address', async () => {
      await expect(eco.connect(accounts[0]).pause()).to.be.revertedWith(
        'ERC20Pausable: not pauser'
      );
    });
  });
});
