const { expect } = require('chai')

const time = require('../utils/time.ts')
const {
  getCommit,
  getFormattedBallot,
} = require('../../tools/test/currencyGovernanceVote')
const { ecoFixture, policyFor } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

describe('Notifier [@group=2]', () => {
  let alice
  let bob
  let charlie
  let policy
  let eco
  let ecox
  let timedPolicies
  let borda
  let faucet
  let notifier
  let setupNotifier
  let amm

  const stake = ethers.utils.parseEther('200000000')
  let aliceBalance
  let proposedInflationMult
  const notifierHash = ethers.utils.solidityKeccak256(['string'], ['Notifier'])

  const minimalAMMABI = [
    'function sync()',
    'function syncRevert()',
    'function syncBadAssert()',
  ]
  const ammInterface = new ethers.utils.Interface(minimalAMMABI)
  const syncData = ammInterface.encodeFunctionData('sync')
  const syncRevertData = ammInterface.encodeFunctionData('syncRevert')
  const syncBadAssertData = ammInterface.encodeFunctionData('syncBadAssert')

  beforeEach(async () => {
    const accounts = await ethers.getSigners()
    ;[alice, bob, charlie] = accounts
    const trustees = [
      await alice.getAddress(),
      await bob.getAddress(),
      await charlie.getAddress(),
    ]

    ;({ policy, eco, ecox, faucet, timedPolicies, notifier } = await ecoFixture(
      trustees
    ))

    await faucet.mint(await alice.getAddress(), stake)
    await faucet.mint(await bob.getAddress(), stake)
    await faucet.mint(await charlie.getAddress(), stake.mul(2))

    setupNotifier = await deploy('Notifier', policy.address)
    // setup the dummy contract for the notifier
    amm = await deploy('DummyAMMPool', eco.address, ecox.address)
    await eco.connect(charlie).transfer(amm.address, stake)
    aliceBalance = await ecox.balanceOf(alice.getAddress())
    await ecox.connect(alice).transfer(amm.address, aliceBalance)
    await amm.sync()
  })

  it('test amm dummy is initialized correctly', async () => {
    const ammEcoBalance = await eco.balanceOf(amm.address)
    const ammEcoSupply = await amm.reserve0()
    expect(ammEcoBalance).to.equal(ammEcoSupply)

    const ammEcoXBalance = await ecox.balanceOf(amm.address)
    const ammEcoXSupply = await amm.reserve1()
    expect(ammEcoXBalance).to.equal(aliceBalance)
    expect(ammEcoXBalance).to.equal(ammEcoXSupply)
  })

  it('test setting transactions', async () => {
    const dummyData = '0xdeadbeef'
    await policy.testAddTransaction(
      setupNotifier.address,
      await alice.getAddress(),
      dummyData
    )
    const transaction = await setupNotifier.transactions(0)
    expect(transaction.destination).to.equal(await alice.getAddress())
    expect(transaction.data).to.equal(dummyData)
  })

  it('test adding to notificationHashes', async () => {
    // as the deploy now deploys the notifier, this will say true
    // const preHashes = await timedPolicies.getNotificationHashes()
    // expect(preHashes.includes(notifierHash)).to.be.false
    const switcher = await deploy('SwitcherTimedPolicies')
    await policy.testAddNotificationHash(
      timedPolicies.address,
      switcher.address,
      notifierHash
    )
    const postHashes = await timedPolicies.getNotificationHashes()
    expect(postHashes[2]).to.equal(notifierHash)
    expect(postHashes[3]).to.equal(notifierHash)
  })

  it('test setting notifier in policy', async () => {
    await policy.testDirectSet('Notifier', setupNotifier.address)
    const notifierPolicyAddress = await policy.policyFor(notifierHash)
    expect(notifierPolicyAddress).to.equal(setupNotifier.address)
  })

  describe('after a linear inflation', () => {
    beforeEach(async () => {
      borda = await ethers.getContractAt(
        'CurrencyGovernance',
        await policyFor(
          policy,
          ethers.utils.solidityKeccak256(['string'], ['CurrencyGovernance'])
        )
      )

      const digits1to9 = Math.floor(Math.random() * 900000000) + 100000000
      const digits10to19 = Math.floor(Math.random() * 10000000000)
      proposedInflationMult = `${digits10to19}${digits1to9}`

      // propose a random inflation multiplier
      await borda.connect(bob).propose(0, 0, 0, 0, proposedInflationMult, '')

      await time.increase(3600 * 24 * 10.1)

      const alicevote = [
        ethers.utils.randomBytes(32),
        await alice.getAddress(),
        [await bob.getAddress()],
      ]
      await borda.connect(alice).commit(getCommit(...alicevote))
      const bobvote = [
        ethers.utils.randomBytes(32),
        await bob.getAddress(),
        [await bob.getAddress()],
      ]
      await borda.connect(bob).commit(getCommit(...bobvote))
      await time.increase(3600 * 24 * 3)
      await borda
        .connect(alice)
        .reveal(alicevote[0], getFormattedBallot(alicevote[2]))
      await borda
        .connect(bob)
        .reveal(bobvote[0], getFormattedBallot(bobvote[2]))
      await time.increase(3600 * 24 * 1)
      await borda.updateStage()
      await borda.compute()
    })

    it('test amm pool working correctly', async () => {
      await timedPolicies.incrementGeneration()
      await amm.sync()

      // this value stays the same
      const ammEcoXBalance = await ecox.balanceOf(amm.address)
      const ammEcoXSupply = await amm.reserve1()
      expect(ammEcoXBalance).to.equal(aliceBalance)
      expect(ammEcoXBalance).to.equal(ammEcoXSupply)

      // this value is rescaled
      const ammEcoBalance = await eco.balanceOf(amm.address)
      const ammEcoSupply = await amm.reserve0()
      expect(ammEcoBalance).to.equal(ammEcoSupply)
      const convertedBalance = stake
        .mul(await eco.INITIAL_INFLATION_MULTIPLIER())
        .div(ethers.BigNumber.from(proposedInflationMult))
      expect(ammEcoSupply).to.equal(convertedBalance)
    })

    describe('notifying', () => {
      beforeEach(async () => {
        // this is done in the deploy fixture
        // await policy.testDirectSet('Notifier', notifier.address)
        // const switcher = await deploy('SwitcherTimedPolicies')
        // await policy.testAddNotificationHash(
        //   timedPolicies.address,
        //   switcher.address,
        //   notifierHash
        // )
      })

      it('survives notifying revert', async () => {
        await policy.testAddTransaction(
          notifier.address,
          amm.address,
          syncRevertData
        )
        await expect(timedPolicies.incrementGeneration())
          .to.emit(notifier, 'TransactionFailed')
          .withArgs(0, amm.address, syncRevertData)
      })

      it('survives notifying failed assert', async () => {
        await policy.testAddTransaction(
          notifier.address,
          amm.address,
          syncBadAssertData
        )
        await expect(timedPolicies.incrementGeneration())
          .to.emit(notifier, 'TransactionFailed')
          .withArgs(0, amm.address, syncBadAssertData)
      })

      it('notifying syncs the pool', async () => {
        await policy.testAddTransaction(notifier.address, amm.address, syncData)
        await timedPolicies.incrementGeneration()

        // this value stays the same
        const ammEcoXBalance = await ecox.balanceOf(amm.address)
        const ammEcoXSupply = await amm.reserve1()
        expect(ammEcoXBalance).to.equal(aliceBalance)
        expect(ammEcoXBalance).to.equal(ammEcoXSupply)

        // this value is rescaled
        const ammEcoBalance = await eco.balanceOf(amm.address)
        const ammEcoSupply = await amm.reserve0()
        expect(ammEcoBalance).to.equal(ammEcoSupply)
        const convertedBalance = stake
          .mul(await eco.INITIAL_INFLATION_MULTIPLIER())
          .div(ethers.BigNumber.from(proposedInflationMult))
        expect(ammEcoSupply).to.equal(convertedBalance)
      })

      it('can notify a bunch of things, even nonesense, and still succeed', async () => {
        await policy.testAddTransaction(
          notifier.address,
          amm.address,
          syncRevertData
        )
        await policy.testAddTransaction(
          notifier.address,
          amm.address,
          syncBadAssertData
        )
        await policy.testAddTransaction(notifier.address, amm.address, syncData)
        await policy.testAddTransaction(notifier.address, eco.address, syncData)
        const tx = await timedPolicies.incrementGeneration()
        await tx.wait()
        const events = await notifier.queryFilter('TransactionFailed')
        expect(events.length).to.equal(3)
        const firstFailure = events.find((e) => e.args.index.eq(0))
        const secondFailure = events.find((e) => e.args.index.eq(1))
        const thirdFailure = events.find((e) => e.args.index.eq(3))
        expect(firstFailure.args.destination).to.equal(amm.address)
        expect(secondFailure.args.destination).to.equal(amm.address)
        expect(thirdFailure.args.destination).to.equal(eco.address)
        expect(firstFailure.args.data).to.equal(syncRevertData)
        expect(secondFailure.args.data).to.equal(syncBadAssertData)
        expect(thirdFailure.args.data).to.equal(syncData)

        const ammEcoBalance = await eco.balanceOf(amm.address)
        const ammEcoSupply = await amm.reserve0()
        expect(ammEcoBalance).to.equal(ammEcoSupply)
        const convertedBalance = stake
          .mul(await eco.INITIAL_INFLATION_MULTIPLIER())
          .div(ethers.BigNumber.from(proposedInflationMult))
        expect(ammEcoSupply).to.equal(convertedBalance)
      })
    })
  })
})
