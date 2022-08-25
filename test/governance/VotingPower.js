

const { ethers } = require('hardhat')
const time = require('../utils/time.ts')
const { ecoFixture } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('VotingPower [@group=2]', () => {
  let policy
  let eco
  let faucet
  let timedPolicies
  let proposals
  let blockNumber
  let ecox
  let ecoXStaking
  let one
  let alicePower

  let alice
  let bob
  let charlie

  const aliceBalance = 250
  const aliceXBalance = 400

  async function getProposals() {
    const proposalsHash = ethers.utils.solidityKeccak256(
      ['string'],
      ['PolicyProposals']
    )

    const proposalsAddress = await policy.policyFor(proposalsHash)

    return await ethers.getContractAt('PolicyProposals', proposalsAddress)
  }

  beforeEach(async () => {
    one = ethers.utils.parseEther('1')
    const accounts = await ethers.getSigners()
    let deployer
    ;[deployer, alice, bob, charlie] = accounts
    const trustednodes = [await bob.getAddress()]

    ;({ policy, eco, faucet, timedPolicies, ecox, ecoXStaking } =
      await ecoFixture(trustednodes))

    await faucet.mint(await alice.getAddress(), one.mul(aliceBalance))
    await faucet.mint(await bob.getAddress(), one.mul(aliceBalance))
    await faucet.mint(await charlie.getAddress(), one.mul(2 * aliceBalance))

    await time.increase(3600 * 24 * 14 + 1)
    await timedPolicies.incrementGeneration()

    await ecox
      .connect(deployer)
      .transfer(await alice.getAddress(), one.mul(aliceXBalance))
    await ecox
      .connect(deployer)
      .transfer(await bob.getAddress(), one.mul(aliceXBalance))
    await ecox
      .connect(deployer)
      .transfer(await charlie.getAddress(), one.mul(aliceXBalance / 2))

    // calculated from the above variables for when ECOx is exchanged
    alicePower = '741824697641270317824'

    await time.increase(3600 * 24 * 14 + 1)
    await timedPolicies.incrementGeneration()
    blockNumber = await time.latestBlock()
    await time.advanceBlock()
  })

  context('with nothing locked up', () => {
    beforeEach(async () => {
      proposals = await getProposals()
    })

    describe('only ECO power', () => {
      it('Has the correct total power', async () => {
        // 1000 total, no ECOx power
        const ecoTotal = await eco.totalSupply()
        const ecoXTotal = await ecox.totalSupply()
        expect(await proposals.totalVotingPower(blockNumber)).to.equal(
          ecoTotal.add(ecoXTotal)
        )
      })

      it('Has the right power for alice', async () => {
        // 250, no ECOx power
        expect(
          await proposals.votingPower(await alice.getAddress(), blockNumber)
        ).to.equal(one.mul(aliceBalance))
      })
    })

    describe('only ECO power, bolstered by exchanged ECOx', () => {
      beforeEach(async () => {
        await ecox.connect(alice).exchange(one.mul(400))
        await time.increase(3600 * 24 * 14 + 1)
        await timedPolicies.incrementGeneration()
        blockNumber = await time.latestBlock()
        await time.advanceBlock()
        proposals = await getProposals()
      })

      it('Has the correct total power', async () => {
        const ecoTotal = await eco.totalSupply()
        const ecoXTotal = await ecox.totalSupply()
        expect(await proposals.totalVotingPower(blockNumber)).to.equal(
          ecoTotal.add(ecoXTotal)
        )
      })

      it('Has the right power for alice', async () => {
        // correctly includes all the converted ECOx
        expect(
          await proposals.votingPower(await alice.getAddress(), blockNumber)
        ).to.equal(alicePower)
      })
    })
  })

  context('voting checkpoint stress tests', () => {
    beforeEach(async () => {
      proposals = await getProposals()
    })

    it('gets the right voting power despite multiple transfers', async () => {
      await eco.connect(charlie).enableDelegationTo()
      await eco.connect(bob).delegate(await charlie.getAddress())
      const blockNumber1 = await time.latestBlock()

      // don't go much above 60 on iterations
      const iterations1 = 50
      const iterations2 = 6
      const promises1 = []

      const aliceAddress = await alice.getAddress()
      const bobAddress = await bob.getAddress()
      // net zero transfer
      for (let i = 0; i < iterations1; i++) {
        promises1.push(eco.connect(bob).transfer(aliceAddress, one.mul(4)))
        promises1.push(eco.connect(alice).transfer(bobAddress, one.mul(4)))
      }
      await Promise.all(promises1)

      const blockNumber2 = await time.latestBlock()
      const promises2 = []

      // net zero transfer
      for (let i = 0; i < iterations2; i++) {
        promises2.push(eco.connect(bob).transfer(aliceAddress, one.mul(4)))
        promises2.push(eco.connect(alice).transfer(bobAddress, one.mul(4)))
      }
      await Promise.all(promises2)

      // the only net transfer
      await eco.connect(bob).transfer(await alice.getAddress(), one.mul(40))
      const blockNumber3 = await time.latestBlock()
      await time.advanceBlock()

      /* eslint-disable no-console */
      // gas tests for the older blocks
      console.log(
        await proposals.estimateGas.votingPower(
          await alice.getAddress(),
          blockNumber1
        )
      )
      console.log(
        await proposals.estimateGas.votingPower(
          await alice.getAddress(),
          blockNumber2
        )
      )
      console.log(
        await proposals.estimateGas.votingPower(
          await alice.getAddress(),
          blockNumber3
        )
      )
      /* eslint-enable no-console */

      // before everything
      expect(
        await proposals.votingPower(await alice.getAddress(), blockNumber1)
      ).to.equal(one.mul(250))
      expect(
        await proposals.votingPower(await bob.getAddress(), blockNumber1)
      ).to.equal(0)
      expect(
        await proposals.votingPower(await charlie.getAddress(), blockNumber1)
      ).to.equal(one.mul(750))
      // in the middle
      expect(
        await proposals.votingPower(await alice.getAddress(), blockNumber2)
      ).to.equal(one.mul(250))
      expect(
        await proposals.votingPower(await bob.getAddress(), blockNumber2)
      ).to.equal(0)
      expect(
        await proposals.votingPower(await charlie.getAddress(), blockNumber2)
      ).to.equal(one.mul(750))
      // after with a net transfer
      expect(
        await proposals.votingPower(await alice.getAddress(), blockNumber3)
      ).to.equal(one.mul(290))
      expect(
        await proposals.votingPower(await bob.getAddress(), blockNumber3)
      ).to.equal(0)
      expect(
        await proposals.votingPower(await charlie.getAddress(), blockNumber3)
      ).to.equal(one.mul(710))
    })

    it('test of flashloan attacks', async () => {
      beforeEach(async () => {
        proposals = await getProposals()
      })

      const flashLoaner = await deploy('FlashLoaner', eco.address)

      await eco.connect(bob).approve(flashLoaner.address, one.mul(200))
      await eco.connect(alice).approve(flashLoaner.address, one.mul(205))
      const blockNumber1 = await time.latestBlock()

      await flashLoaner.flashLoan(
        await bob.getAddress(),
        await alice.getAddress(),
        one.mul(200),
        one.mul(205)
      )
      const blockNumber2 = await time.latestBlock()
      await time.advanceBlock()

      // before everything
      expect(
        await proposals.votingPower(await alice.getAddress(), blockNumber1)
      ).to.equal(one.mul(250))
      expect(
        await proposals.votingPower(await bob.getAddress(), blockNumber1)
      ).to.equal(one.mul(250))
      // in the middle
      expect(
        await proposals.votingPower(await alice.getAddress(), blockNumber2)
      ).to.equal(one.mul(245))
      expect(
        await proposals.votingPower(await bob.getAddress(), blockNumber2)
      ).to.equal(one.mul(255))
    })
  })

  context('by delegating', () => {
    beforeEach(async () => {
      proposals = await getProposals()
    })

    describe('only ECO power', () => {
      it('Has the right power for bob after alice delegates here votes to him', async () => {
        await eco.connect(bob).enableDelegationTo()
        await eco.connect(alice).delegate(await bob.getAddress())
        blockNumber = await time.latestBlock()
        await time.advanceBlock()
        expect(
          await proposals.votingPower(await bob.getAddress(), blockNumber)
        ).to.equal(one.mul(500))
      })
    })
  })

  context('after locking up all ECOx', () => {
    describe('Voting power with ECO and ECOx', async () => {
      beforeEach(async () => {
        // approve deposits
        await ecox.connect(alice).approve(ecoXStaking.address, one.mul(400))
        await ecox.connect(bob).approve(ecoXStaking.address, one.mul(400))
        await ecox.connect(charlie).approve(ecoXStaking.address, one.mul(200))

        // stake funds
        await ecoXStaking.connect(alice).deposit(one.mul(400))
        await ecoXStaking.connect(bob).deposit(one.mul(400))
        await ecoXStaking.connect(charlie).deposit(one.mul(200))

        // one total generation in stake before voting
        await time.increase(3600 * 24 * 14 + 1)
        await timedPolicies.incrementGeneration()
        await time.increase(3600 * 24 * 14 + 1)
        await timedPolicies.incrementGeneration()
        blockNumber = await time.latestBlock()
        await time.advanceBlock()
        proposals = await getProposals()
      })

      it('Has the correct total power', async () => {
        // 10k ECO total + 10k ECOx total
        expect(await proposals.totalVotingPower(blockNumber)).to.equal(
          one.mul(2000)
        )
      })

      it('Has the right power for alice', async () => {
        // 2.5k ECO + 4k ECOx
        expect(
          await proposals.votingPower(await alice.getAddress(), blockNumber)
        ).to.equal(one.mul(650))
      })
    })
  })
})
