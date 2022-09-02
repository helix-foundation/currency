/*
 * This is an end-to-end test of the circuit breaker policy.
 *
 * Note that this 'test' shares states between the it() functions, and
 * it() is used mostly to break up the logical steps.
 *
 * The purpose of this test is to show how a single trustee can be replaced,
 * how a full suite of trustees can be replaces, and how a new TrustedNodes
 * contract can replace the old one.
 */

const { expect } = require('chai')
const { ethers } = require('hardhat')
const time = require('../utils/time.ts')
const { ecoFixture } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')
const util = require('../../tools/test/util')

const { BigNumber } = ethers

describe('Governance Circuit Breaker Change [@group=9]', () => {
  let policy
  let eco
  let ecox
  let timedPolicies
  let policyProposals
  let policyVotes
  let initInflation
  let electCircuitBreaker
  let borda

  let alice
  let bob
  let charlie
  let dave

  it('Deploys the production system', async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie, dave] = accounts
    const trustednodes = [
      await bob.getAddress(),
      await charlie.getAddress(),
      await dave.getAddress(),
    ]

    ;({
      policy,
      eco,
      ecox,
      faucet: initInflation,
      timedPolicies,
    } = await ecoFixture(trustednodes))
  })

  it('Stakes accounts', async () => {
    const stake = ethers.utils.parseEther('5000')
    await initInflation.mint(await alice.getAddress(), stake)
    await initInflation.mint(await bob.getAddress(), stake)
    await initInflation.mint(await charlie.getAddress(), stake)
    await initInflation.mint(await dave.getAddress(), stake)
  })

  it('Waits a generation', async () => {
    await time.increase(3600 * 24 * 40)
    await timedPolicies.incrementGeneration()
    borda = await ethers.getContractAt(
      'CurrencyGovernance',
      await util.policyFor(
        policy,
        ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
      )
    )
  })

  it('Kicks off a proposal round', async () => {
    const proposalsHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['PolicyProposals']
    )
    policyProposals = await ethers.getContractAt(
      'PolicyProposals',
      await util.policyFor(policy, proposalsHash)
    )
  })

  it('Constructs the proposals', async () => {
    electCircuitBreaker = await deploy(
      'ElectCircuitBreaker',
      await bob.getAddress()
    )
    expect(await electCircuitBreaker.name()).to.equal(
      'Circuit Breaker Election Proposal Template'
    )
    expect(await electCircuitBreaker.description()).to.equal(
      'Elects a new admin address that can call circuit breaker functions'
    )
    expect(await electCircuitBreaker.url()).to.equal(
      'https://description.of.proposal make this link to a discussion of the new circuit breaker'
    )
    expect(await electCircuitBreaker.pauser()).to.equal(await bob.getAddress())
  })

  it('Checks that bob does not have the circuit breaker permissions', async () => {
    expect(await eco.pauser()).not.to.equal(await bob.getAddress())
    expect(await ecox.pauser()).not.to.equal(await bob.getAddress())
    expect(await borda.pauser()).not.to.equal(await bob.getAddress())
    expect(await eco.pauser()).to.equal(ethers.constants.AddressZero)
    expect(await ecox.pauser()).to.equal(ethers.constants.AddressZero)
    expect(await borda.pauser()).to.equal(ethers.constants.AddressZero)
  })

  it('Accepts new proposals', async () => {
    await eco
      .connect(alice)
      .approve(policyProposals.address, await policyProposals.COST_REGISTER())
    await policyProposals
      .connect(alice)
      .registerProposal(electCircuitBreaker.address)

    await time.increase(3600 * 24 * 2)
  })

  it('Adds stake to proposals to ensure that it goes to a vote', async () => {
    await policyProposals.connect(alice).support(electCircuitBreaker.address)
    await policyProposals.connect(bob).support(electCircuitBreaker.address)
    await policyProposals.connect(bob).deployProposalVoting()
  })

  it('Transitions from proposing to voting', async () => {
    const policyVotesIdentifierHash = web3.utils.soliditySha3('PolicyVotes')
    policyVotes = await ethers.getContractAt(
      'PolicyVotes',
      await util.policyFor(policy, policyVotesIdentifierHash)
    )
  })

  it('Allows all users to vote', async () => {
    await policyVotes.connect(alice).vote(true)
    await policyVotes.connect(bob).vote(true)
  })

  it('Waits another week (end of commit period)', async () => {
    await time.increase(3600 * 24 * 7)
  })

  it('Executes the outcome of the votes', async () => {
    await policyVotes.execute()
  })

  it('Checks that bob now has the circuit breaker permissions', async () => {
    expect(await eco.pauser()).to.equal(await bob.getAddress())
    expect(await ecox.pauser()).to.equal(await bob.getAddress())
    expect(await borda.pauser()).to.equal(await bob.getAddress())
  })

  describe('currency governance immediately pauseable', async () => {
    const hash = (x) =>
      ethers.utils.solidityKeccak256(
        ['bytes32', 'address', 'address[]'],
        [x[0], x[1], x[2]]
      )

    it('is not paused', async () => {
      expect(await borda.pauser()).to.equal(await bob.getAddress())
      expect(await borda.paused()).to.be.false
    })

    it('cannot be paused by non-pauser', async () => {
      await expect(borda.connect(alice).pause()).to.be.revertedWith(
        'CurrencyGovernance: not pauser'
      )
    })

    it('can be paused by pauser', async () => {
      await borda.connect(bob).pause()
      expect(await borda.paused()).to.be.true
    })

    it('proposes, votes, and reveals', async () => {
      const bobvote = [
        ethers.utils.randomBytes(32),
        await bob.getAddress(),
        [
          await bob.getAddress(),
          await charlie.getAddress(),
          await dave.getAddress(),
        ],
      ]
      const charlievote = [
        ethers.utils.randomBytes(32),
        await charlie.getAddress(),
        [await charlie.getAddress()],
      ]
      const davevote = [
        ethers.utils.randomBytes(32),
        await dave.getAddress(),
        [
          await dave.getAddress(),
          await bob.getAddress(),
          await charlie.getAddress(),
        ],
      ]
      // propose
      await borda
        .connect(dave)
        .propose(10, 10, 10, 10, BigNumber.from('1000000000000000000'), '')
      await borda
        .connect(charlie)
        .propose(20, 20, 20, 20, BigNumber.from('1000000000000000000'), '')
      await borda
        .connect(bob)
        .propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'), '')
      await time.increase(3600 * 24 * 1)
      await borda.updateStage()

      // commit
      await borda.connect(bob).commit(hash(bobvote))
      await borda.connect(charlie).commit(hash(charlievote))
      await borda.connect(dave).commit(hash(davevote))

      await time.increase(3600 * 24 * 3)
      // reveal
      await borda.connect(bob).reveal(bobvote[0], bobvote[2])
      await borda.connect(charlie).reveal(charlievote[0], charlievote[2])
      await borda.connect(dave).reveal(davevote[0], davevote[2])
      expect(await borda.leader()).to.equal(await bob.getAddress())
      await time.increase(3600 * 24 * 1)
      await borda.updateStage()
    })

    it('should use default proposal', async () => {
      // should vote in the default proposal even though bob won
      await expect(borda.compute())
        .to.emit(borda, 'VoteResult')
        .withArgs(ethers.constants.AddressZero)
    })
  })

  describe('currency governance pauseable in subsequent generations', async () => {
    const hash = (x) =>
      ethers.utils.solidityKeccak256(
        ['bytes32', 'address', 'address[]'],
        [x[0], x[1], x[2]]
      )

    before(async () => {
      await timedPolicies.incrementGeneration()
      borda = await ethers.getContractAt(
        'CurrencyGovernance',
        await util.policyFor(
          policy,
          ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
        )
      )
    })

    it('is not paused', async () => {
      expect(await borda.pauser()).to.equal(await bob.getAddress())
      expect(await borda.paused()).to.be.false
    })

    it('cannot be paused by non-pauser', async () => {
      await expect(borda.connect(alice).pause()).to.be.revertedWith(
        'CurrencyGovernance: not pauser'
      )
    })

    it('proposes, votes, and reveals', async () => {
      const bobvote = [
        ethers.utils.randomBytes(32),
        await bob.getAddress(),
        [
          await bob.getAddress(),
          await charlie.getAddress(),
          await dave.getAddress(),
        ],
      ]
      const charlievote = [
        ethers.utils.randomBytes(32),
        await charlie.getAddress(),
        [await charlie.getAddress()],
      ]
      const davevote = [
        ethers.utils.randomBytes(32),
        await dave.getAddress(),
        [
          await dave.getAddress(),
          await bob.getAddress(),
          await charlie.getAddress(),
        ],
      ]
      // propose
      await borda
        .connect(dave)
        .propose(10, 10, 10, 10, BigNumber.from('1000000000000000000'), '')
      await borda
        .connect(charlie)
        .propose(20, 20, 20, 20, BigNumber.from('1000000000000000000'), '')
      await borda
        .connect(bob)
        .propose(30, 30, 30, 30, BigNumber.from('1000000000000000000'), '')
      await time.increase(3600 * 24 * 10)
      await borda.updateStage()

      // commit
      await borda.connect(bob).commit(hash(bobvote))
      await borda.connect(charlie).commit(hash(charlievote))
      await borda.connect(dave).commit(hash(davevote))

      await time.increase(3600 * 24 * 3)
      // reveal
      await borda.connect(bob).reveal(bobvote[0], bobvote[2])
      await borda.connect(charlie).reveal(charlievote[0], charlievote[2])
      await borda.connect(dave).reveal(davevote[0], davevote[2])
      expect(await borda.leader()).to.equal(await bob.getAddress())
    })

    it('can be paused quite late by pauser', async () => {
      await borda.connect(bob).pause()
      expect(await borda.paused()).to.be.true
    })

    it('should use default proposal', async () => {
      await time.increase(3600 * 24 * 1)
      await borda.updateStage()
      // should vote in the default proposal even though bob won
      await expect(borda.compute())
        .to.emit(borda, 'VoteResult')
        .withArgs(ethers.constants.AddressZero)
    })
  })

  describe('circuit breaker', async () => {
    describe('eco and ecox paused', async () => {
      it('is not paused', async () => {
        expect(await eco.paused()).to.be.false
        expect(await ecox.paused()).to.be.false
      })

      it('transfers work', async () => {
        const aliceInitialBalance = await eco.balanceOf(
          await alice.getAddress()
        )
        await eco
          .connect(alice)
          .transfer(await charlie.getAddress(), ethers.utils.parseEther('1'))
        expect(await eco.balanceOf(await alice.getAddress())).to.equal(
          aliceInitialBalance.sub(ethers.utils.parseEther('1'))
        )

        const aliceInitialBalanceX = await ecox.balanceOf(
          await alice.getAddress()
        )
        await ecox
          .connect(alice)
          .transfer(await charlie.getAddress(), ethers.utils.parseEther('1'))
        expect(await ecox.balanceOf(await alice.getAddress())).to.equal(
          aliceInitialBalanceX.sub(ethers.utils.parseEther('1'))
        )
      })

      it('can not be paused by non-pauser', async () => {
        await expect(eco.connect(alice).pause()).to.be.revertedWith(
          'ERC20Pausable: not pauser'
        )

        await expect(ecox.connect(alice).pause()).to.be.revertedWith(
          'ERC20Pausable: not pauser'
        )
      })

      it('pauser cannot be set by non-admin', async () => {
        await expect(
          eco.connect(alice).setPauser(await alice.getAddress())
        ).to.be.revertedWith('ERC20Pausable: not admin')

        await expect(
          ecox.connect(alice).setPauser(await alice.getAddress())
        ).to.be.revertedWith('ERC20Pausable: not admin')
      })

      it('cannot set pauser to current pauser', async () => {
        await expect(
          policy.connect(bob).testSetPauser(eco.address, await bob.getAddress())
        ).to.be.revertedWith('ERC20Pausable: must change pauser')

        await expect(
          policy
            .connect(bob)
            .testSetPauser(ecox.address, await bob.getAddress())
        ).to.be.revertedWith('ERC20Pausable: must change pauser')
      })

      it('can be paused by pauser', async () => {
        await expect(eco.connect(bob).pause())
          .to.emit(eco, 'Paused')
          .withArgs(await bob.getAddress())
        expect(await eco.paused()).to.be.true

        await expect(ecox.connect(bob).pause())
          .to.emit(ecox, 'Paused')
          .withArgs(await bob.getAddress())
        expect(await ecox.paused()).to.be.true
      })

      it('transfers no longer work', async () => {
        await expect(
          eco
            .connect(alice)
            .transfer(await charlie.getAddress(), ethers.utils.parseEther('1'))
        ).to.be.revertedWith('Pausable: paused')

        await expect(
          eco
            .connect(bob)
            .transfer(await charlie.getAddress(), ethers.utils.parseEther('1'))
        ).to.be.revertedWith('Pausable: paused')

        await expect(
          ecox
            .connect(alice)
            .transfer(await charlie.getAddress(), ethers.utils.parseEther('1'))
        ).to.be.revertedWith('Pausable: paused')

        await expect(
          ecox
            .connect(bob)
            .transfer(await charlie.getAddress(), ethers.utils.parseEther('1'))
        ).to.be.revertedWith('Pausable: paused')
      })

      it('cannot be unpaused by non-pauser', async () => {
        await expect(eco.connect(alice).unpause()).to.be.revertedWith(
          'ERC20Pausable: not pauser'
        )

        await expect(ecox.connect(alice).unpause()).to.be.revertedWith(
          'ERC20Pausable: not pauser'
        )
      })

      it('can be unpaused by pauser', async () => {
        await expect(eco.connect(bob).unpause())
          .to.emit(eco, 'Unpaused')
          .withArgs(await bob.getAddress())

        await expect(ecox.connect(bob).unpause())
          .to.emit(ecox, 'Unpaused')
          .withArgs(await bob.getAddress())
      })

      it('transfers work again', async () => {
        const aliceInitialBalance = await eco.balanceOf(
          await alice.getAddress()
        )
        await eco
          .connect(alice)
          .transfer(await charlie.getAddress(), ethers.utils.parseEther('1'))
        expect(await eco.balanceOf(await alice.getAddress())).to.equal(
          aliceInitialBalance.sub(ethers.utils.parseEther('1'))
        )

        const aliceInitialBalanceX = await ecox.balanceOf(
          await alice.getAddress()
        )
        await ecox
          .connect(alice)
          .transfer(await charlie.getAddress(), ethers.utils.parseEther('1'))
        expect(await ecox.balanceOf(await alice.getAddress())).to.equal(
          aliceInitialBalanceX.sub(ethers.utils.parseEther('1'))
        )
      })
    })

    describe('policy proposal fee disabling', async () => {
      before(async () => {
        await time.increase(3600 * 24 * 40)
        await timedPolicies.incrementGeneration()
      })

      it('Kicks off a proposal round', async () => {
        const proposalsHash = ethers.utils.solidityKeccak256(
          ['string'],
          ['PolicyProposals']
        )
        policyProposals = await ethers.getContractAt(
          'PolicyProposals',
          await util.policyFor(policy, proposalsHash)
        )
      })

      it('still charges a fee', async () => {
        const newProposal = await deploy(
          'ElectCircuitBreaker',
          await alice.getAddress()
        )
        const aliceBalanceBefore = await eco.balanceOf(await alice.getAddress())
        await eco
          .connect(alice)
          .approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER()
          )
        await policyProposals
          .connect(alice)
          .registerProposal(newProposal.address)
        const aliceBalanceAfter = await eco.balanceOf(await alice.getAddress())
        expect(aliceBalanceAfter).to.equal(
          aliceBalanceBefore.sub(await policyProposals.COST_REGISTER())
        )
      })

      it('no longer charges a fee when paused', async () => {
        await expect(eco.connect(bob).pause())
          .to.emit(eco, 'Paused')
          .withArgs(await bob.getAddress())
        expect(await eco.paused()).to.be.true
        const newProposal = await deploy(
          'ElectCircuitBreaker',
          await charlie.getAddress()
        )
        const charlieBalanceBefore = await eco.balanceOf(
          await charlie.getAddress()
        )
        await policyProposals
          .connect(charlie)
          .registerProposal(newProposal.address)
        const charlieBalanceAfter = await eco.balanceOf(
          await charlie.getAddress()
        )
        expect(charlieBalanceAfter).to.equal(charlieBalanceBefore)
      })

      it('charges a fee again when unpaused', async () => {
        await expect(eco.connect(bob).unpause())
          .to.emit(eco, 'Unpaused')
          .withArgs(await bob.getAddress())
        const newProposal = await deploy(
          'ElectCircuitBreaker',
          await alice.getAddress()
        )
        const aliceBalanceBefore = await eco.balanceOf(await alice.getAddress())
        await eco
          .connect(alice)
          .approve(
            policyProposals.address,
            await policyProposals.COST_REGISTER()
          )
        await policyProposals
          .connect(alice)
          .registerProposal(newProposal.address)
        const aliceBalanceAfter = await eco.balanceOf(await alice.getAddress())
        expect(aliceBalanceAfter).to.equal(
          aliceBalanceBefore.sub(await policyProposals.COST_REGISTER())
        )
      })
    })
  })
})
