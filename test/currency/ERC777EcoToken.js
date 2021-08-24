const chai = require('chai');

const { BN, toBN } = web3.utils;
const bnChai = require('bn-chai');

const { expect } = chai;
const PolicyInit = artifacts.require('PolicyInit');
const ForwardProxy = artifacts.require('ForwardProxy');
const Policy = artifacts.require('FakePolicy');
const EcoBalanceStore = artifacts.require('EcoBalanceStore');
const ERC777EcoToken = artifacts.require('ERC777EcoToken');
const ERC777EcoTokenAcceptingReceiver = artifacts.require(
  'ERC777EcoTokenAcceptingReceiver',
);
const ERC777EcoTokenRejectingReceiver = artifacts.require(
  'ERC777EcoTokenRejectingReceiver',
);
const ERC777EcoTokenHolder = artifacts.require('ERC777EcoTokenHolder');
const MurderousPolicy = artifacts.require('MurderousPolicy');
const FakeInflation = artifacts.require('FakeInflation');
const InflationRootHashProposal = artifacts.require('InflationRootHashProposal');
const {
  expectEvent, expectRevert, constants, singletons,
} = require('@openzeppelin/test-helpers');

const { isCoverage } = require('../../tools/test/coverage');

const UNKNOWN_POLICY_ID = web3.utils.soliditySha3('AttemptedMurder');

chai.use(bnChai(BN));

contract('ERC777EcoToken [@group=9]', ([owner, ...accounts]) => {
  let erc1820registry;
  let balanceStore;
  let token;
  let policy;
  let inflation;
  let w3token;
  let murderer;
  let attemptedMurderer;

  beforeEach(async () => {
    const policyInit = await PolicyInit.new();
    const proxy = await ForwardProxy.new(policyInit.address);
    const rootHash = await InflationRootHashProposal.new(proxy.address);
    balanceStore = await EcoBalanceStore.new(proxy.address, rootHash.address, { from: owner });
    token = await ERC777EcoToken.new(proxy.address, { from: owner });
    inflation = await FakeInflation.new();

    murderer = await MurderousPolicy.new();
    attemptedMurderer = await MurderousPolicy.new();

    const tokenHash = web3.utils.soliditySha3('ERC777Token');
    const storeHash = web3.utils.soliditySha3('BalanceStore');

    await (await PolicyInit.at(proxy.address)).fusedInit(
      (await Policy.new()).address,
      [],
      [
        tokenHash,
        storeHash,
        await balanceStore.ID_CLEANUP(),
        UNKNOWN_POLICY_ID,
        await balanceStore.ID_CURRENCY_GOVERNANCE(),
      ],
      [
        token.address,
        balanceStore.address,
        murderer.address,
        attemptedMurderer.address,
        inflation.address,
      ],
      [tokenHash],
    );

    policy = await Policy.at(proxy.address);
    await balanceStore.reAuthorize();

    w3token = new web3.eth.Contract(token.abi, token.address);
    erc1820registry = await singletons.ERC1820Registry();
  });

  describe('metadata', () => {
    it('returns the same name as the balance store', async () => {
      const tokenName = await token.name();
      const storeName = await balanceStore.name();

      expect(tokenName).to.equal(storeName);
    });

    it('returns the same symbol as the balance store', async () => {
      const tokenSymbol = await token.symbol();
      const storeSymbol = await balanceStore.symbol();

      expect(tokenSymbol).to.equal(storeSymbol);
    });

    it('has granularity 1', async () => {
      const granularity = await token.granularity();

      expect(granularity).to.eq.BN(1);
    });
  });

  describe('total supply', () => {
    beforeEach(async () => {
      await inflation.mint(
        balanceStore.address,
        accounts[1],
        new BN(100).toString(),
      );
    });

    it('returns the total amount of tokens', async () => {
      const supply = await token.totalSupply();
      expect(supply).to.eq.BN(100);
    });
  });

  describe('balanceOf', () => {
    beforeEach(async () => {
      await inflation.mint(
        balanceStore.address,
        accounts[1],
        new BN(100).toString(),
      );
    });

    context('when the requested account has no tokens', () => {
      it('returns 0', async () => {
        const balance = await token.balanceOf(accounts[2]);

        expect(balance).to.eq.BN(0);
      });
    });

    context('when there are tokens in the account', () => {
      it('returns the correct balance', async () => {
        const balance = await token.balanceOf(accounts[1]);

        expect(balance).to.eq.BN(100);
      });
    });
  });

  function testSendWith(description, fn) {
    describe(description, () => {
      const balance1000 = accounts[1];
      const balance0 = accounts[2];

      beforeEach(async () => {
        await inflation.mint(
          balanceStore.address,
          balance1000,
          new BN(1000).toString(),
        );
        await balanceStore.update(balance0);
      });

      [new BN(100), new BN(0)].forEach((amount) => {
        context(`from an account with 1000 tokens sending ${amount}`, () => {
          const meta = { from: balance1000, gas: 2000000 };

          it('decreases the account balance', async () => {
            const startBalance = await token.balanceOf(balance1000);
            await fn(balance0, amount.toString(), meta);
            const endBalance = await token.balanceOf(balance1000);

            expect(startBalance.sub(endBalance)).to.eq.BN(amount);
          });

          it('increases the recipient balance', async () => {
            const startBalance = await token.balanceOf(balance0);
            await fn(balance0, amount.toString(), meta);
            const endBalance = await token.balanceOf(balance0);

            expect(endBalance.sub(startBalance)).to.eq.BN(amount.toString());
          });

          it('emits a Sent event', async () => {
            const result = await fn(balance0, amount.toString(), meta);
            await expectEvent.inTransaction(result.transactionHash, token.constructor, 'Sent');
          });

          context('with an ERC777TokensSender implementation', () => {
            let senderInterface;
            beforeEach(async () => {
              senderInterface = await ERC777EcoTokenHolder.new(
                token.address,
                false,
                { from: owner },
              );
              await erc1820registry
                .setInterfaceImplementer(
                  balance1000,
                  web3.utils.soliditySha3('ERC777TokensSender'),
                  senderInterface.address,
                  { from: balance1000 },
                );
            });

            it('calls the tokensToSend function', async () => {
              const tx = await fn(balance0, amount.toString(), meta);
              await expectEvent.inTransaction(tx.transactionHash, senderInterface.constructor, 'ReceivedERC777Call');
            });
          });

          context('to a contract with ERC1820 definition', () => {
            context('that accepts ECO tokens', () => {
              let recipient;

              beforeEach(async () => {
                recipient = await ERC777EcoTokenAcceptingReceiver.new(
                  token.address,
                  true,
                  { from: owner },
                );
                await balanceStore.update(recipient.address);
              });

              it('calls the receiving function', async () => {
                const tx = await fn(recipient.address, amount.toString(), meta);
                await expectEvent.inTransaction(tx.transactionHash, recipient.constructor, 'ReceivedERC777Call');
              });
            });

            context('that rejects ECO tokens', () => {
              let recipient;

              beforeEach(async () => {
                recipient = await ERC777EcoTokenRejectingReceiver.new(
                  token.address,
                  true,
                  { from: owner },
                );
              });

              it('reverts', async () => {
                await expectRevert.unspecified(
                  fn(recipient.address, amount.toString(), meta),
                );
              });
            });
          });

          context('to a contract without ERC1820 definition', () => {
            let recipient;

            beforeEach(async () => {
              recipient = await ERC777EcoTokenAcceptingReceiver.new(
                token.address,
                false,
                { from: owner },
              );
            });

            it('reverts', async () => {
              await expectRevert.unspecified(
                fn(recipient.address, amount.toString(), meta),
              );
            });
          });

          context('when the recipient is the 0 address', () => {
            xit('reverts', async () => {
              await expectRevert(
                fn(constants.ZERO_ADDRESS, amount.toString(), meta),
                'Cannot send to 0x0',
              );
            });
          });
        });
      });

      context('from an account with 0 tokens sending 0', () => {
        const meta = { from: balance0, gas: 200000 };
        const amount = new BN(0);

        beforeEach(async () => {
          if (await isCoverage()) {
            meta.gas = 1000000;
          }
        });

        it('does not change the account balance', async () => {
          const startBalance = await token.balanceOf(balance0);
          await fn(balance1000, amount.toString(), meta);
          const endBalance = await token.balanceOf(balance0);

          expect(startBalance.sub(endBalance)).to.eq.BN(0);
        });

        it('does not change the recipient balance', async () => {
          const startBalance = await token.balanceOf(balance1000);
          await fn(balance1000, amount.toString(), meta);
          const endBalance = await token.balanceOf(balance1000);

          expect(endBalance.sub(startBalance)).to.eq.BN(0);
        });

        it('emits a Sent event', async () => {
          const result = await fn(balance0, amount.toString(), meta);
          await expectEvent.inTransaction(result.transactionHash, token.constructor, 'Sent');
        });
      });

      const amount = new BN(100);
      context(`from an account with 0 tokens sending ${amount}`, () => {
        const meta = { from: balance0 };

        it('reverts', async () => {
          try {
            await fn(balance0, amount.toString(), meta);
            expect.fail('expected revert');
          } catch (e) {
            expect(e.message).to.match(/revert/, 'Expected revert');
          }
        });
      });
    });
  }

  const DATA_SEND = 'send(address,uint256,bytes)';
  testSendWith(
    'send (with data)',
    (to, amount, meta) => {
      const DATA_SEND_DATA = web3.utils.toHex('test data');
      return w3token.methods[DATA_SEND](
        to,
        amount.toString(),
        DATA_SEND_DATA,
      ).send(meta);
    },
  );

  describe('isOperatorFor', () => {
    context('for the owner', () => {
      it('returns true', async () => {
        expect(await token.isOperatorFor(owner, owner)).to.be.true;
      });
    });

    context('for a non-operator', () => {
      it('returns false', async () => {
        expect(await token.isOperatorFor(accounts[1], owner)).to.be.false;
      });
    });
  });

  describe('authorizeOperator', () => {
    context('for the owner', () => {
      it('reverts', async () => {
        await expectRevert(
          token.authorizeOperator(owner, { from: owner }),
          'Can\'t authorize yourself',
        );
      });
    });

    context('for an unauthorized user address', () => {
      context('from the owner', () => {
        const meta = { from: owner };
        const operator = accounts[1];

        it('starts without operator privileges', async () => {
          expect(await token.isOperatorFor(operator, owner)).to.be.false;
        });

        it('sets the account as an operator', async () => {
          await token.authorizeOperator(operator, meta);

          expect(await token.isOperatorFor(operator, owner)).to.be.true;
        });

        it('emits an AuthorizedOperator event', async () => {
          const result = await token.authorizeOperator(operator, meta);
          await expectEvent.inTransaction(
            result.tx,
            token.constructor,
            'AuthorizedOperator',
          );
        });
      });
    });
  });

  describe('revokeOperator', () => {
    const meta = { from: owner };

    context('for the owner', () => {
      it('reverts', async () => {
        await expectRevert(
          token.revokeOperator(owner, meta),
          'Can\'t revoke account holder',
        );
      });
    });

    context('for an operator', () => {
      const operator = accounts[1];

      beforeEach(async () => {
        await token.authorizeOperator(operator, meta);
      });

      it('starts with operator privileges', async () => {
        expect(await token.isOperatorFor(operator, owner)).to.be.true;
      });

      it('removes operator privileges', async () => {
        await token.revokeOperator(operator, meta);

        expect(await token.isOperatorFor(operator, owner)).to.be.false;
      });

      it('emits an RevokedOperator event', async () => {
        const result = await token.revokeOperator(operator, meta);
        await expectEvent.inTransaction(
          result.tx,
          token.constructor,
          'RevokedOperator',
        );
      });
    });

    context('for a non-operator', () => {
      const operator = accounts[1];
      const other = accounts[2];

      beforeEach(async () => {
        await token.authorizeOperator(operator, meta);
      });

      it('starts without operator privileges', async () => {
        expect(await token.isOperatorFor(other, owner)).to.be.false;
      });

      it('remains without operator privileges', async () => {
        await token.revokeOperator(other, meta);

        expect(await token.isOperatorFor(other, owner)).to.be.false;
      });

      it('emits an RevokedOperator event', async () => {
        const result = await token.revokeOperator(other, meta);
        await expectEvent.inTransaction(result.tx, token.constructor, 'RevokedOperator');
      });
    });
  });

  describe('operatorSend', () => {
    const operator = accounts[1];
    const other = accounts[2];
    const amount = new BN(100);

    context('from an authorized operator', () => {
      const meta = { from: operator };

      context('when the source is an externally owned account', () => {
        const holder = accounts[3];

        beforeEach(async () => {
          await token.authorizeOperator(operator, { from: holder });
        });

        context('when there is sufficient funds', () => {
          beforeEach(async () => {
            await inflation.mint(balanceStore.address, holder, amount);
          });

          context('with an ERC777TokensSender implementation', () => {
            const recipient = other;
            let senderInterface;

            beforeEach(async () => {
              senderInterface = await ERC777EcoTokenHolder.new(
                token.address,
                false,
                { from: owner },
              );
              await erc1820registry
                .setInterfaceImplementer(
                  holder,
                  web3.utils.soliditySha3('ERC777TokensSender'),
                  senderInterface.address,
                  { from: holder },
                );
            });

            it('calls the tokensToSend function', async () => {
              const tx = await token.operatorSend(
                holder,
                recipient,
                amount.toString(),
                '0x',
                '0x',
                meta,
              );
              await expectEvent.inTransaction(tx.tx, senderInterface.constructor, 'ReceivedERC777Call');
            });
          });

          context('when the recipient is an externally owned account', () => {
            const recipient = other;

            it('decreases the source balance', async () => {
              const startBalance = await token.balanceOf(holder);
              await token.operatorSend(
                holder,
                recipient,
                amount.toString(),
                '0x',
                '0x',
                meta,
              );
              const endBalance = await token.balanceOf(holder);

              expect(startBalance.sub(endBalance)).to.eq.BN(amount);
            });

            it('increases the recipient balance', async () => {
              const startBalance = await token.balanceOf(recipient);
              await token.operatorSend(
                holder,
                recipient,
                amount.toString(),
                '0x',
                '0x',
                meta,
              );
              const endBalance = await token.balanceOf(recipient);

              expect(endBalance.sub(startBalance)).to.eq.BN(amount);
            });

            it('emits a Sent event', async () => {
              const result = await token.operatorSend(
                holder,
                recipient,
                amount.toString(),
                '0x',
                '0x',
                meta,
              );
              await expectEvent.inTransaction(
                result.tx,
                token.constructor,
                'Sent',
              );
            });
          });

          context('when the recipient is a contract', () => {
            context(
              'with an ERC1820-registered recipient implementation',
              () => {
                context('that accepts ECO tokens', () => {
                  let recipient;

                  beforeEach(async () => {
                    recipient = await ERC777EcoTokenAcceptingReceiver.new(
                      token.address,
                      true,
                      { from: owner },
                    );
                  });

                  it('decreases the source balance', async () => {
                    const startBalance = await token.balanceOf(holder);
                    await token.operatorSend(
                      holder,
                      recipient.address,
                      amount.toString(),
                      '0x',
                      '0x',
                      meta,
                    );
                    const endBalance = await token.balanceOf(holder);

                    expect(startBalance.sub(endBalance)).to.eq.BN(amount);
                  });

                  it('increases the recipient balance', async () => {
                    const startBalance = await token.balanceOf(
                      recipient.address,
                    );
                    await token.operatorSend(
                      holder,
                      recipient.address,
                      amount.toString(),
                      '0x',
                      '0x',
                      meta,
                    );
                    const endBalance = await token.balanceOf(recipient.address);

                    expect(endBalance.sub(startBalance)).to.eq.BN(amount);
                  });

                  it('calls tokensReceived on the recipient', async () => {
                    const tx = await token.operatorSend(
                      holder,
                      recipient.address,
                      amount.toString(),
                      '0x',
                      '0x',
                      meta,
                    );
                    await expectEvent.inTransaction(tx.tx, recipient.constructor, 'ReceivedERC777Call');
                  });

                  it('emits a Sent event', async () => {
                    const result = await token.operatorSend(
                      holder,
                      recipient.address,
                      amount.toString(),
                      '0x',
                      '0x',
                      meta,
                    );
                    await expectEvent.inTransaction(
                      result.tx,
                      token.constructor,
                      'Sent',
                    );
                  });
                });

                context('that rejects ECO tokens', () => {
                  let recipient;

                  beforeEach(async () => {
                    recipient = await ERC777EcoTokenRejectingReceiver.new(
                      token.address,
                      true,
                      { from: owner },
                    );
                  });

                  it('reverts', async () => {
                    await expectRevert(
                      token.operatorSend(
                        holder,
                        recipient.address,
                        amount.toString(),
                        '0x',
                        '0x',
                        meta,
                      ),
                      'does not accept',
                    );
                  });
                });
              },
            );

            context(
              'without an ERC1820 registered recipient implementation',
              () => {
                let recipient;

                beforeEach(async () => {
                  recipient = await ERC777EcoTokenAcceptingReceiver.new(
                    token.address,
                    false,
                    { from: owner },
                  );
                });

                it('reverts', async () => {
                  await expectRevert(
                    token.operatorSend(
                      holder,
                      recipient.address,
                      amount.toString(),
                      '0x',
                      '0x',
                      meta,
                    ),
                    'must provide an ERC1820 interface',
                  );
                });
              },
            );
          });

          context('when the recipient is the 0 address', () => {
            const recipient = constants.ZERO_ADDRESS;

            it('reverts', async () => {
              await expectRevert(
                token.operatorSend(
                  holder,
                  recipient,
                  amount.toString(),
                  '0x',
                  '0x',
                  meta,
                ),
                'Cannot send to 0x0',
              );
            });
          });
        });

        context('when there are insufficient funds', () => {
          context('when the recipient is an externally owned account', () => {
            const recipient = other;

            it('reverts', async () => {
              await expectRevert(
                token.operatorSend(
                  holder,
                  recipient,
                  amount.toString(),
                  '0x',
                  '0x',
                  meta,
                ),
                'account has insufficient tokens',
              );
            });
          });

          context('when the recipient is a contract', () => {
            context(
              'with an ERC1820-registered recipient implementation',
              () => {
                let recipient;

                beforeEach(async () => {
                  recipient = await ERC777EcoTokenAcceptingReceiver.new(
                    token.address,
                    true,
                    { from: owner },
                  );
                });

                it('reverts', async () => {
                  await expectRevert(
                    token.operatorSend(
                      holder,
                      recipient.address,
                      amount.toString(),
                      '0x',
                      '0x',
                      meta,
                    ),
                    'account has insufficient tokens',
                  );
                });
              },
            );

            context(
              'without an ERC1820-registered recipient implementation',
              () => {
                let recipient;

                beforeEach(async () => {
                  recipient = await ERC777EcoTokenAcceptingReceiver.new(
                    token.address,
                    false,
                    { from: owner },
                  );
                });

                it('reverts', async () => {
                  await expectRevert(
                    token.operatorSend(
                      holder,
                      recipient.address,
                      amount.toString(),
                      '0x',
                      '0x',
                      meta,
                    ),
                    'account has insufficient tokens',
                  );
                });
              },
            );
          });
        });
      });
    });

    context('from an account without operator privileges', () => {
      const meta = { from: other };
      const holder = accounts[3];
      const recipient = other;

      beforeEach(async () => {
        await inflation.mint(balanceStore.address, holder, amount);
      });

      it('reverts', async () => {
        await expectRevert(
          token.operatorSend(
            holder,
            recipient,
            amount.toString(),
            '0x',
            '0x',
            meta,
          ),
          'Only an authorized operator may use this feature',
        );
      });
    });
  });

  context('events from minting and burning', () => {
    it('needs to be figured out');
  });

  describe('Burnable', () => {
    const [, accountA, accountB, other] = accounts;
    const populatedAccounts = [accountA, accountB];
    const accountStartBalance = 100000;

    beforeEach('create the tokens to be burned', async () => Promise.all(
      populatedAccounts.map((account) => inflation.mint(
        balanceStore.address,
        account,
        accountStartBalance,
      )),
    ));

    it('should start with a token supply of 200000', async () => {
      const tokenSupply = await balanceStore.tokenSupply();

      expect(tokenSupply).to.eq.BN(200000);
    });

    it(`should have two ${accountStartBalance} unit accounts`, async () => {
      await Promise.all(
        populatedAccounts.map(async (account) => expect(
          await balanceStore.balance(account),
        ).to.eq.BN(accountStartBalance)),
      );
    });

    context('for an unauthorized user', () => {
      context('burning another\'s tokens', () => {
        const meta = { from: other };

        it('should revert', async () => {
          await expectRevert(
            token.operatorBurn(accountA, toBN(1), '0x', '0x', meta),
            'Not an operator',
          );
        });

        it('should not decrease the balance', async () => {
          const startBalance = await balanceStore.balance(accountA);
          await expectRevert.unspecified(token.operatorBurn(accountA, toBN(1), '0x', '0x', meta));
          const endBalance = await balanceStore.balance(accountA);

          expect(endBalance).to.eq.BN(startBalance);
        });

        it('should not decrease supply', async () => {
          const startSupply = await balanceStore.tokenSupply();
          await expectRevert.unspecified(token.operatorBurn(accountA, toBN(1), '0x', '0x', meta));
          const endSupply = await balanceStore.tokenSupply();
          expect(endSupply).to.eq.BN(startSupply);
        });
      });

      context('burning own tokens', () => {
        const meta = { from: accountA };

        it('should decrease the balance', async () => {
          const startBalance = await balanceStore.balance(accountA);
          await token.burn(100, '0x', meta);
          const endBalance = await balanceStore.balance(accountA);

          expect(startBalance.sub(endBalance)).to.eq.BN(100);
        });

        it('should decrease the supply', async () => {
          const startSupply = await balanceStore.tokenSupply();
          await token.burn(200, '0x', meta);
          const endSupply = await balanceStore.tokenSupply();

          expect(startSupply.sub(endSupply)).to.eq.BN(200);
        });
      });
    });

    context('for the policy contract', () => {
      context('burning up to the balance', () => {
        it('should decrease the balance', async () => {
          const startBalance = await balanceStore.balance(accountA);
          await policy.burn(balanceStore.address, accountA, 100);
          const endBalance = await balanceStore.balance(accountA);

          expect(startBalance.sub(endBalance)).to.eq.BN(100);
        });

        it('should decrease the supply', async () => {
          const startSupply = await balanceStore.tokenSupply();
          await policy.burn(balanceStore.address, accountA, 200);
          const endSupply = await balanceStore.tokenSupply();

          expect(startSupply.sub(endSupply)).to.eq.BN(200);
        });
      });

      context('burning more than the balance', () => {
        it('should revert', async () => {
          await expectRevert(
            policy.burn(balanceStore.address, accountA, 200000),
            'Insufficient funds to burn',
          );
        });

        it('should not decrease the balance', async () => {
          const startBalance = await balanceStore.balance(accountA);
          await expectRevert.unspecified(
            policy.burn(balanceStore.address, accountA, 200000),
          );
          const endBalance = await balanceStore.balance(accountA);

          expect(endBalance).to.eq.BN(startBalance);
        });

        it('should not decrease supply', async () => {
          const startSupply = await balanceStore.tokenSupply();
          await expectRevert.unspecified(
            policy.burn(balanceStore.address, accountA, 200000),
          );
          const endSupply = await balanceStore.tokenSupply();

          expect(endSupply).to.eq.BN(startSupply);
        });
      });
    });
  });

  describe('Destructible', () => {
    context('when instructed by an unauthorized user', () => {
      const [, other] = accounts;
      it('cannot be killed', async () => {
        await expectRevert(
          token.destruct({ from: other }),
          'Only the cleanup policy',
        );
      });
    });

    context('when instructed by an authorized policy', () => {
      it('can be killed', async () => {
        await murderer.destruct(token.address);
      });
    });

    context('when instructed by an unauthorized policy', () => {
      it('cannot be killed', async () => {
        await expectRevert(
          attemptedMurderer.destruct(token.address),
          'Only the cleanup policy',
        );
      });
    });
  });
});
