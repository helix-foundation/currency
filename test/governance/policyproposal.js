const time = require('../utils/time.ts')

const { ecoFixture } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

const one = ethers.utils.parseEther('1')

describe('PolicyProposals [@group=7]', () => {
  let alice
  let bob
  let charlie
  let dave
  let policy
  let eco
  let initInflation
  let timedPolicies

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie, dave] = accounts
    ;({
      policy,
      eco,
      faucet: initInflation,
      timedPolicies,
    } = await ecoFixture([]))

    await initInflation.mint(
      await alice.getAddress(),
      ethers.utils.parseEther('50000')
    )
    await initInflation.mint(
      await bob.getAddress(),
      ethers.utils.parseEther('50000')
    )
    await initInflation.mint(
      await charlie.getAddress(),
      ethers.utils.parseEther('100000')
    )
    await time.increase(3600 * 24 * 40)
    await timedPolicies.incrementGeneration()
  })

  async function getProposals() {
    const proposalsHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['PolicyProposals']
    )

    const proposalsAddress = await policy.policyFor(proposalsHash)

    const proposals = await ethers.getContractAt(
      'PolicyProposals',
      proposalsAddress
    )

    return proposals
  }

  describe('registerProposal', () => {
    let policyProposals
    let testProposal
    let testProposal2

    beforeEach(async () => {
      policyProposals = await getProposals()
      testProposal = await deploy('Empty', 1)
      testProposal2 = await deploy('Empty', 2)
    })

    context('during the registration period', () => {
      context('when the fee is not approved', () => {
        it('cannot register a proposal', async () => {
          await expect(
            policyProposals.registerProposal(testProposal.address)
          ).to.be.revertedWith('ERC20: transfer amount exceeds allowance')
        })
      })

      context('when the fee is pre-approved', () => {
        beforeEach(async () => {
          await eco.approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER()
          )
        })

        it("can't register a zero address proposal", async () => {
          await expect(
            policyProposals.registerProposal(
              '0x0000000000000000000000000000000000000000'
            )
          ).to.be.revertedWith("The proposal address can't be 0")
        })

        it('can register a proposal', async () => {
          await policyProposals.registerProposal(testProposal.address)
        })

        it('updates the allProposalAddresses index', async () => {
          await policyProposals.registerProposal(testProposal.address)
          const allProposalAddresses =
            await policyProposals.getPaginatedProposalAddresses(1, 1)
          expect(allProposalAddresses).to.deep.equal([testProposal.address])
        })

        it('starts with the correct supporting stake', async () => {
          await policyProposals.registerProposal(testProposal.address)

          const stake = (
            await policyProposals.proposals(testProposal.address)
          )[2]
          expect(stake).to.equal(0)
        })

        it('emits the Register event', async () => {
          await expect(
            policyProposals.registerProposal(testProposal.address)
          ).to.emit(policyProposals, 'Register')
        })
      })

      context('when the proposal has already been registered', () => {
        beforeEach(async () => {
          await eco.approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER()
          )

          await policyProposals.registerProposal(testProposal.address)

          await eco.approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER()
          )
        })

        it('cannot register a second time', async () => {
          await expect(
            policyProposals.registerProposal(testProposal.address)
          ).to.be.revertedWith('A proposal may only be registered once')
        })
      })

      context('when a different proposal has already been selected', () => {
        beforeEach(async () => {
          await eco.approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER()
          )

          await policyProposals.registerProposal(testProposal.address)

          await policyProposals.connect(charlie).support(testProposal.address)

          await eco.approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER()
          )
        })

        it('reverts', async () => {
          await expect(
            policyProposals.registerProposal(testProposal2.address)
          ).to.be.revertedWith(
            'Proposals may no longer be registered because the registration period has ended'
          )
        })
      })
    })

    context('outside the registration period', () => {
      beforeEach(async () => {
        await time.increase(3600 * 240 + 1)
      })

      it('reverts', async () => {
        await expect(
          policyProposals.registerProposal(testProposal.address)
        ).to.be.revertedWith(
          'Proposals may no longer be registered because the registration period has ended'
        )
      })
    })
  })

  describe('paginate proposals', () => {
    const totalProposals = 25
    let allProposals
    let allPropsData
    let policyProposals
    beforeEach(async () => {
      policyProposals = await getProposals()

      /* eslint-disable no-await-in-loop */
      for (let i = 0; i < totalProposals; i++) {
        const testProposal = await deploy('Empty', i)
        await eco
          .connect(charlie)
          .approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER()
          )
        await policyProposals
          .connect(charlie)
          .registerProposal(testProposal.address)
      }
      /* eslint-enable no-await-in-loop */

      allProposals = await policyProposals.getPaginatedProposalAddresses(
        1,
        totalProposals
      )
      allPropsData = await policyProposals.getPaginatedProposalData(
        1,
        totalProposals
      )
    })

    it('should revert if we ask for page 0', async () => {
      await expect(
        policyProposals.getPaginatedProposalAddresses(0, 10)
      ).to.be.revertedWith('Page must be non-zero')
      await expect(
        policyProposals.getPaginatedProposalData(0, 10)
      ).to.be.revertedWith('Page must be non-zero')
    })

    it('should return all proposals', async () => {
      expect(allProposals.length).to.equal(totalProposals)
      expect(allPropsData.length).to.equal(totalProposals)
    })

    it('should return all proposals on overflow of end bound', async () => {
      const proposals = await policyProposals.getPaginatedProposalAddresses(
        1,
        totalProposals * 2
      )
      const data = await policyProposals.getPaginatedProposalData(
        1,
        totalProposals * 2
      )
      expect(proposals).to.deep.equal(allProposals)
      expect(data).to.deep.equal(allPropsData)
    })

    it('should return empty if we ask for results out of index', async () => {
      const proposals = await policyProposals.getPaginatedProposalAddresses(
        3,
        totalProposals
      )
      const data = await policyProposals.getPaginatedProposalData(
        3,
        totalProposals
      )
      expect(proposals.length).to.eq(0)
      expect(data.length).to.eq(0)
    })

    it('should get the paginated results', async () => {
      const proposals = await policyProposals.getPaginatedProposalAddresses(
        1,
        10
      )
      const data = await policyProposals.getPaginatedProposalData(1, 10)
      expect(proposals.length).to.eq(10)
      expect(data.length).to.eq(10)
      expect(proposals).to.deep.equal(allProposals.slice(0, 10))
      expect(data).to.deep.equal(allPropsData.slice(0, 10))

      const proposals1 = await policyProposals.getPaginatedProposalAddresses(
        2,
        5
      )
      const data1 = await policyProposals.getPaginatedProposalData(2, 5)
      expect(proposals1.length).to.eq(5)
      expect(data1.length).to.eq(5)
      expect(proposals1).to.deep.equal(allProposals.slice(5, 10))
      expect(data1).to.deep.equal(allPropsData.slice(5, 10))
    })

    it('should get truncated paginated results at proposals end', async () => {
      const proposals = await policyProposals.getPaginatedProposalAddresses(
        3,
        10
      )
      const data = await policyProposals.getPaginatedProposalData(3, 10)
      expect(proposals.length).to.eq(5)
      expect(data.length).to.eq(5)
      expect(proposals).to.deep.equal(allProposals.slice(20, 25))
      expect(data).to.deep.equal(allPropsData.slice(20, 25))
    })
  })

  describe('support', () => {
    let policyProposals
    let testProposal
    let testProposal2
    const totalProposals = 2
    beforeEach(async () => {
      policyProposals = await getProposals()
      testProposal = await deploy('Empty', 1)
      testProposal2 = await deploy('Empty', 1)

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER()
      )

      await policyProposals.registerProposal(testProposal.address)

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER()
      )

      await policyProposals.registerProposal(testProposal2.address)
    })

    context('after the registration period', () => {
      beforeEach(async () => {
        await time.increase(3600 * 240 + 1)
      })

      it('reverts', async () => {
        await expect(
          policyProposals.support(testProposal.address)
        ).to.be.revertedWith(
          'Proposals may no longer be supported because the registration period has ended'
        )
      })
    })

    context('during the staking period', () => {
      it('allows staking once', async () => {
        await expect(policyProposals.support(testProposal.address))
          .to.emit(policyProposals, 'Support')
          .withArgs(await alice.getAddress(), testProposal.address)
      })

      it('adds the correct stake amount', async () => {
        const preSupportStake = (
          await policyProposals.proposals(testProposal.address)
        )[2]

        await policyProposals.support(testProposal.address)

        const postSupportStake = (
          await policyProposals.proposals(testProposal.address)
        )[2]

        expect(postSupportStake).to.equal(one.mul(50000).add(preSupportStake))
      })

      it('has the correct data in allProposalData', async () => {
        await policyProposals.connect(alice).support(testProposal.address)
        await policyProposals.connect(bob).support(testProposal2.address)

        const proposal1 = await policyProposals.proposals(testProposal.address)
        const proposal2 = await policyProposals.proposals(testProposal2.address)

        const proposalData = await policyProposals.getPaginatedProposalData(
          1,
          totalProposals
        )

        expect(proposal1[0]).to.equal(proposalData[0][0])
        expect(proposal1[1]).to.equal(proposalData[0][1])
        expect(proposal1[2]).to.equal(proposalData[0][2])
        expect(proposal2[0]).to.equal(proposalData[1][0])
        expect(proposal2[1]).to.equal(proposalData[1][1])
        expect(proposal2[2]).to.equal(proposalData[1][2])
      })

      it('does not allow staking twice', async () => {
        await policyProposals.support(testProposal.address)
        await expect(
          policyProposals.support(testProposal.address)
        ).to.be.revertedWith('You may not stake in support of a proposal twice')
      })

      it('can still stake for multiple proposals', async () => {
        await policyProposals.support(testProposal.address)
        await policyProposals.support(testProposal2.address)
      })

      context('when the staker has no funds', () => {
        it('reverts', async () => {
          await expect(
            policyProposals.connect(dave).support(testProposal.address)
          ).to.be.revertedWith(
            'In order to support a proposal you must stake a non-zero amount of tokens'
          )
        })
      })

      context('when supporting a non-existent proposal', () => {
        it('reverts', async () => {
          await expect(
            policyProposals.support(ethers.constants.AddressZero)
          ).to.be.revertedWith('The supported proposal is not registered')
        })
      })
    })

    context('after the staking period', () => {
      beforeEach(async () => {
        await time.increase(3600 * 1000 + 1)
      })

      it('does not allow staking', async () => {
        await expect(
          policyProposals.support(testProposal.address)
        ).to.be.revertedWith(
          'Proposals may no longer be supported because the registration period has ended'
        )
      })
    })
  })

  describe('unsupport', () => {
    let policyProposals
    let testProposal
    let testProposal2

    beforeEach(async () => {
      policyProposals = await getProposals()
      testProposal = await deploy('Empty', 1)
      testProposal2 = await deploy('Empty', 1)

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER()
      )

      await policyProposals.registerProposal(testProposal.address)

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER()
      )

      await policyProposals.registerProposal(testProposal2.address)

      await policyProposals.support(testProposal.address)
    })

    context('after the registration period', () => {
      beforeEach(async () => {
        await time.increase(3600 * 240 + 1)
      })

      it('reverts', async () => {
        await expect(
          policyProposals.unsupport(testProposal.address)
        ).to.be.revertedWith(
          'Proposals may no longer be supported because the registration period has ended'
        )
      })
    })

    context('when unsupporting an unsupported proposal', () => {
      it('reverts', async () => {
        await expect(
          policyProposals.unsupport(testProposal2.address)
        ).to.be.revertedWith('You have not staked this proposal')
      })
    })

    context('during the staking period', () => {
      it('allows unstaking', async () => {
        await expect(policyProposals.unsupport(testProposal.address))
          .to.emit(policyProposals, 'Unsupport')
          .withArgs(await alice.getAddress(), testProposal.address)
      })

      it('subtracts the correct stake amount', async () => {
        const preUnsupportStake = ethers.BigNumber.from(
          (await policyProposals.proposals(testProposal.address))[2]
        )

        await policyProposals.unsupport(testProposal.address)

        const postUnsupportStake = ethers.BigNumber.from(
          (await policyProposals.proposals(testProposal.address))[2]
        )

        expect(postUnsupportStake).to.equal(
          preUnsupportStake.sub(one.mul(50000))
        )
      })

      it('can be indicisive if you want', async () => {
        await policyProposals.unsupport(testProposal.address)
        await policyProposals.support(testProposal.address)
        await policyProposals.unsupport(testProposal.address)
        await policyProposals.support(testProposal.address)
        await policyProposals.unsupport(testProposal.address)
        await policyProposals.support(testProposal.address)
        await policyProposals.unsupport(testProposal.address)
        await policyProposals.support(testProposal.address)

        const supportedStake = ethers.BigNumber.from(
          (await policyProposals.proposals(testProposal.address))[2]
        )

        expect(supportedStake).to.equal(one.mul(50000))
      })
    })
  })

  describe('deployProposalVoting', () => {
    let policyProposals
    let testProposal

    it('reverts if proposal not selected', async () => {
      policyProposals = await getProposals()
      testProposal = await deploy('Empty', 1)

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER()
      )

      await policyProposals.registerProposal(testProposal.address)

      await expect(
        policyProposals.connect(alice).deployProposalVoting()
      ).to.be.revertedWith('no proposal has been selected')
    })
  })

  describe('success', () => {
    let policyProposals
    let testProposal

    beforeEach(async () => {
      policyProposals = await getProposals()
      testProposal = await deploy('Empty', 1)

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER()
      )

      await policyProposals.registerProposal(testProposal.address)
      await policyProposals.support(testProposal.address)
    })

    context('when still holds the policy role and proposals made', () => {
      it('emits the VoteStart event', async () => {
        await policyProposals.connect(charlie).support(testProposal.address)
        await expect(policyProposals.deployProposalVoting()).to.emit(
          policyProposals,
          'VoteStart'
        )
      })

      it('rejects support if proposal is chosen', async () => {
        await policyProposals.connect(charlie).support(testProposal.address)

        await expect(
          policyProposals.support(testProposal.address)
        ).to.be.revertedWith('A proposal has already been selected')
      })

      it('rejects unsupport if proposal is chosen', async () => {
        await policyProposals.connect(charlie).support(testProposal.address)

        await expect(
          policyProposals.unsupport(testProposal.address)
        ).to.be.revertedWith('A proposal has already been selected')
      })

      it('rejects support if deployed', async () => {
        await policyProposals.connect(charlie).support(testProposal.address)
        await policyProposals.deployProposalVoting()

        await expect(
          policyProposals.support(testProposal.address)
        ).to.be.revertedWith('A proposal has already been selected')
      })

      it('deletes proposalToConfigure', async () => {
        await policyProposals.connect(charlie).support(testProposal.address)
        const proposalToConfigure = await policyProposals.proposalToConfigure()

        await policyProposals.deployProposalVoting()
        const zeroAddress = await policyProposals.proposalToConfigure()

        expect(proposalToConfigure).to.not.equal(zeroAddress)
        expect(zeroAddress).to.equal(ethers.constants.AddressZero)
      })

      it('cannot double deploy', async () => {
        await policyProposals.connect(charlie).support(testProposal.address)
        await policyProposals.deployProposalVoting()

        await expect(policyProposals.deployProposalVoting()).to.be.revertedWith(
          'voting has already been deployed'
        )
      })
    })

    context('when no longer the policy role', () => {
      beforeEach(async () => {
        await policy.testDirectSet(
          'PolicyProposals',
          ethers.constants.AddressZero
        )
      })

      it('rejects support', async () => {
        await expect(
          policyProposals.support(testProposal.address)
        ).to.be.revertedWith('Proposal contract no longer active')
      })

      it('rejects unsupport', async () => {
        await expect(
          policyProposals.unsupport(testProposal.address)
        ).to.be.revertedWith('Proposal contract no longer active')
      })
    })
  })

  describe('refund', () => {
    let policyProposals
    let testProposal
    let testProposal2
    beforeEach(async () => {
      policyProposals = await getProposals()
      testProposal = await deploy('Empty', 1)
      testProposal2 = await deploy('Empty', 2)

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER()
      )

      await policyProposals.registerProposal(testProposal.address)

      await eco.approve(
        policyProposals.address,
        await policyProposals.COST_REGISTER()
      )

      await policyProposals.registerProposal(testProposal2.address)
    })

    context('before results are computed', () => {
      it('reverts', async () => {
        await expect(
          policyProposals.refund(testProposal.address)
        ).to.be.revertedWith(
          'Refunds may not be distributed until the period is over'
        )
      })
    })

    context('when a policy is selected', () => {
      beforeEach(async () => {
        await policyProposals.connect(alice).support(testProposal.address)
        await policyProposals.connect(charlie).support(testProposal2.address)
      })

      it('tries to refund selected policy, reverts', async () => {
        await expect(
          policyProposals.refund(testProposal2.address)
        ).to.be.revertedWith(
          'Refunds may not be distributed until the period is over'
        )
      })

      context('when the voting is deployed', () => {
        beforeEach(async () => {
          await policyProposals.connect(charlie).deployProposalVoting()
        })

        it('tries to refund selected policy, reverts', async () => {
          await expect(
            policyProposals.refund(testProposal2.address)
          ).to.be.revertedWith('The provided proposal address is not valid')
        })

        it('tries to refund non-selected policy, succeeds', async () => {
          await expect(policyProposals.refund(testProposal.address))
            .to.emit(policyProposals, 'ProposalRefund')
            .withArgs(await alice.getAddress(), testProposal.address)
        })
      })
    })

    context('when the policy is not selected', () => {
      beforeEach(async () => {
        await time.increase(3600 * 240 + 1)
      })

      it('reverts', async () => {
        await expect(
          policyProposals.refund('0x0000000000000000000000000000000000000000')
        ).to.be.revertedWith("The proposal address can't be 0")
      })

      it('succeeds', async () => {
        await expect(policyProposals.refund(testProposal.address))
          .to.emit(policyProposals, 'ProposalRefund')
          .withArgs(await alice.getAddress(), testProposal.address)
      })

      // it('fails', async () => {
      //   // need to cover the branch where the refund fails for 100% coverage
      // });

      it('transfers the refund tokens', async () => {
        const refundAmount = ethers.BigNumber.from(
          await policyProposals.REFUND_IF_LOST()
        )
        const preRefundBalance = ethers.BigNumber.from(
          await eco.balanceOf(await alice.getAddress())
        )

        await policyProposals.refund(testProposal.address)

        expect(
          (await eco.balanceOf(await alice.getAddress())).sub(preRefundBalance)
        ).to.equal(refundAmount)
      })
    })
  })

  describe('destruct', () => {
    let policyProposals
    let testProposal
    let testProposal2

    context('before results are computed', () => {
      beforeEach(async () => {
        policyProposals = await getProposals()
      })

      it('reverts', async () => {
        await expect(policyProposals.destruct()).to.be.revertedWith(
          'The destruct operation can only be performed when the period is over'
        )
      })
    })

    context('after results are computed and proposals are refunded', () => {
      beforeEach(async () => {
        policyProposals = await getProposals()
        testProposal = await deploy('Empty', 1)
        testProposal2 = await deploy('Empty', 2)

        await eco.approve(
          policyProposals.address,
          await policyProposals.COST_REGISTER()
        )

        await policyProposals.registerProposal(testProposal.address)
      })

      it('succeeds if proposal window has ended', async () => {
        await policyProposals.support(testProposal.address)
        await time.increase(3600 * 240 + 1)
        await policyProposals.refund(testProposal.address)

        const balancePPBefore = await eco.balanceOf(policyProposals.address)
        const balancePolicyBefore = await eco.balanceOf(policy.address)
        await policyProposals.destruct()
        const balancePPAfter = await eco.balanceOf(policyProposals.address)
        const balancePolicyAfter = await eco.balanceOf(policy.address)
        expect(balancePolicyAfter).to.equal(
          balancePolicyBefore + balancePPBefore
        )
        expect(balancePPAfter).to.equal(0)
      })

      it('succeeds if proposal selected ahead of time', async () => {
        const costRegister = await policyProposals.COST_REGISTER()
        const refundAmount = await policyProposals.REFUND_IF_LOST()
        await eco.approve(
          policyProposals.address,
          await policyProposals.COST_REGISTER()
        )

        await policyProposals.registerProposal(testProposal2.address)

        await policyProposals.support(testProposal.address)
        await policyProposals.connect(charlie).support(testProposal2.address)
        await policyProposals.connect(charlie).deployProposalVoting()

        await policyProposals.refund(testProposal.address)

        await policyProposals.destruct()

        const balancePPAfter = await eco.balanceOf(policyProposals.address)
        const balanceTreasury = await eco.balanceOf(policy.address)
        expect(balancePPAfter).to.equal(0)
        expect(balanceTreasury).to.equal(costRegister.mul(2).sub(refundAmount))
      })
    })

    context('after results are computed with proposals not refunded', () => {
      beforeEach(async () => {
        policyProposals = await getProposals()
        testProposal = await deploy('Empty', 1)

        await eco.approve(
          policyProposals.address,
          await policyProposals.COST_REGISTER()
        )

        await policyProposals.registerProposal(testProposal.address)
        await policyProposals.support(testProposal.address)

        await time.increase(3600 * 240 + 1)
      })

      it('reverts', async () => {
        await expect(policyProposals.destruct()).to.be.revertedWith(
          'Must refund all missed proposals first'
        )
      })
    })
  })
})
