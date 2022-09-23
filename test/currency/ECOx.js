/* eslint-disable no-underscore-dangle */

const { expect } = require('chai')
const { BigNumber } = require('ethers')

const { ecoFixture } = require('../utils/fixtures')
const { permit } = require('../../tools/test/permit')

describe('ECOx', () => {
  let policy
  let eco
  let ecox
  let faucet
  let alice
  let bob
  let charlie

  beforeEach('global setup', async () => {
    const accounts = await ethers.getSigners()
    alice = accounts[1]
    bob = accounts[2]
    charlie = accounts[3]
    ;({ policy, eco, ecox, faucet } = await ecoFixture())

    await faucet.mint(
      await alice.getAddress(),
      BigNumber.from('200000000000000000000')
    )
    await faucet.mint(
      await bob.getAddress(),
      BigNumber.from('300000000000000000000')
    )
    await faucet.mint(
      await charlie.getAddress(),
      BigNumber.from('500000000000000000000')
    )

    await ecox.transfer(
      await alice.getAddress(),
      BigNumber.from('50000000000000000000')
    )
    await ecox.transfer(
      await bob.getAddress(),
      BigNumber.from('30000000000000000000')
    )
    await ecox.transfer(
      await charlie.getAddress(),
      BigNumber.from('20000000000000000000')
    )

    return {
      policy,
      eco,
      ecox,
      faucet,
      alice,
      bob,
      charlie,
    }
  })

  it('Verifies starting conditions', async () => {
    expect(await eco.balanceOf(await alice.getAddress())).to.equal(
      '200000000000000000000'
    )
    expect(await eco.balanceOf(await bob.getAddress())).to.equal(
      '300000000000000000000'
    )
    expect(await eco.balanceOf(await charlie.getAddress())).to.equal(
      '500000000000000000000'
    )

    expect(await ecox.balanceOf(await alice.getAddress())).to.equal(
      '50000000000000000000'
    )
    expect(await ecox.balanceOf(await bob.getAddress())).to.equal(
      '30000000000000000000'
    )
    expect(await ecox.balanceOf(await charlie.getAddress())).to.equal(
      '20000000000000000000'
    )

    expect(await eco.totalSupply()).to.equal('1000000000000000000000')
    expect(await ecox.totalSupply()).to.equal('100000000000000000000')
  })

  it('checks the gas cost of converting', async () => {
    const gas = await ecox
      .connect(alice)
      .estimateGas.exchange(BigNumber.from('1000'))
    // eslint-disable-next-line no-console
    console.log(`Conversion costs: ${gas} gas`)
  })

  it('fails if initialSupply == 0', async () => {
    const ecoxFactory = await ethers.getContractFactory('ECOx')
    await expect(
      ecoxFactory.deploy(
        policy.address,
        await charlie.getAddress(),
        0,
        ethers.constants.AddressZero
      )
    ).to.be.revertedWith('initial supply not properly set')
  })

  it('doesnt allow minting to 0 address', async () => {
    await expect(
      faucet.mintx(ethers.constants.AddressZero, BigNumber.from('1000000'))
    ).to.be.revertedWith('ERC20: mint to the zero address')
  })

  it('exchanges ECOx', async () => {
    await ecox.connect(alice).exchange('10000000000000000000')
    expect(await ecox.balanceOf(await alice.getAddress())).to.equal(
      '40000000000000000000'
    )
    // compare to exact value, truncated
    expect(await eco.balanceOf(await alice.getAddress())).to.equal(
      '305170918075647624811'
    )
  })

  it('exchanges a lot of ECOx', async () => {
    await ecox.connect(alice).exchange('50000000000000000000')
    expect(await ecox.balanceOf(await alice.getAddress())).to.equal('0')
    // compare to exact value, truncated
    expect(await eco.balanceOf(await alice.getAddress())).to.equal(
      '848721270700128146848'
    )
  })

  it('exchanges a small amount of ECOx', async () => {
    await ecox.connect(alice).exchange('1500000')
    expect(await ecox.balanceOf(await alice.getAddress())).to.equal(
      '49999999999998500000'
    )
    // compare to exact value, truncated
    expect(await eco.balanceOf(await alice.getAddress())).to.equal(
      '200000000000015000000'
    )

    // THIS IS THE APPROXIMATE MINIMUM ACCURATE EXCHANGEABLE PERCENTAGE VALUE
    // BELOW THIS AMOUNT, THE USER MAY BE SHORTCHANGED 1 OF THE SMALLEST UNIT
    // OF ECO DUE TO ROUNDING/TRUNCATING ERRORS
  })

  it('exchanges more ECOx than exists in balance', async () => {
    await ecox
      .connect(alice)
      .transfer(
        await charlie.getAddress(),
        (await ecox.balanceOf(await alice.getAddress())).sub('1000000')
      )
    await expect(
      ecox.connect(alice).exchange(BigNumber.from('300000000000000000000'))
    ).to.be.revertedWith('ERC20: burn amount exceeds balance')
  })

  context('allowance', () => {
    it('returns the correct allowance', async () => {
      await ecox
        .connect(alice)
        .approve(await bob.getAddress(), BigNumber.from('30000000000000000000'))
      await ecox
        .connect(alice)
        .approve(await bob.getAddress(), BigNumber.from('10000000000000000000'))
      expect(
        await ecox.allowance(await alice.getAddress(), await bob.getAddress())
      ).to.equal('10000000000000000000')
    })
  })

  describe('permit', () => {
    const spender = ethers.Wallet.createRandom()
    const owner = ethers.Wallet.createRandom()
    let chainId

    before(async () => {
      ;({ chainId } = await ethers.provider.getNetwork())
    })

    context('when the source address has enough balance', async () => {
      const amount = ethers.utils.parseEther('1').mul(100)

      it('emits an Approval event', async () => {
        await expect(permit(ecox, owner, spender, chainId, amount)).to.emit(
          ecox,
          'Approval'
        )
      })

      context('when there is no existing allowance', () => {
        it('sets the allowance', async () => {
          await expect(permit(ecox, owner, spender, chainId, amount)).to.emit(
            ecox,
            'Approval'
          )
          const allowance = await ecox.allowance(
            await owner.getAddress(),
            await spender.getAddress()
          )
          expect(allowance).to.equal(amount)
        })
      })

      context('when there is a pre-existing allowance', () => {
        beforeEach(async () => {
          await permit(ecox, owner, spender, chainId, amount.sub(50))
        })

        it('replaces the existing allowance', async () => {
          await permit(ecox, owner, spender, chainId, amount)
          const allowance = await ecox.allowance(
            await owner.getAddress(),
            await spender.getAddress()
          )

          expect(allowance).to.equal(amount)
        })

        it('emits the Approval event', async () => {
          await expect(permit(ecox, owner, spender, chainId, amount)).to.emit(
            ecox,
            'Approval'
          )
        })
      })
    })
  })

  context('mint', () => {
    it('mint reverts if called by non-faucet address', async () => {
      await expect(
        ecox
          .connect(charlie)
          .mint(
            await charlie.getAddress(),
            BigNumber.from('50000000000000000000000')
          )
      ).to.be.revertedWith('Caller not authorized to mint tokens')
    })
  })

  context('Pausable', () => {
    it('is not paused', async () => {
      expect(await ecox.paused()).to.be.false
    })

    it('cannot be paused by random address', async () => {
      await expect(ecox.connect(alice).pause()).to.be.revertedWith(
        'ERC20Pausable: not pauser'
      )
    })
  })

  describe('getters work properly', () => {
    it('name returns correct name', async () => {
      expect(await ecox.name()).to.equal('Eco-X')
    })

    it('symbol returns correct symbol', async () => {
      expect(await ecox.symbol()).to.equal('ECOx')
    })

    it('decimals returns correct number of decimals', async () => {
      expect(await ecox.decimals()).to.equal(18)
    })
  })
})
