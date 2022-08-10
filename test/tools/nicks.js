const EthereumUtil = require('ethereumjs-util')

const { ethers } = require('hardhat')
const { generateTx, decorateTx } = require('../../tools/nicks')

/* Sample bytecode for testing transaction generation.
 *
 * This bytecode was generated by compiling contracts/proxy/ForwardProxy. It's
 * taken from the value "bytecode" in the output JSON (ie, it includes the
 * constructor, and can be run as a contract deployment).
 */
const bytecode =
  '0x608060405234801561001057600080fd5b50604051602080610210833981018060405281019080805190602001909291905050508073ffffffffffffffffffffffffffffffffffffffff1660405160200180807f696e697469616c697a652861646472657373290000000000000000000000000081525060130190506040516020818303038152906040526040518082805190602001908083835b6020831015156100bf578051825260208201915060208101905060208303925061009a565b6001836020036101000a03801982511681845116808217855250505050505090500191505060405180910390207c01000000000000000000000000000000000000000000000000000000009004826040518263ffffffff167c0100000000000000000000000000000000000000000000000000000000028152600401808273ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff168152602001915050600060405180830381865af492505050151561018c57600080fd5b8073ffffffffffffffffffffffffffffffffffffffff16600081905550506058806101b86000396000f3006080604052604051366000823760008036836000545af4156023573d6000823e3d81f35b3d6000823e3d81fd00a165627a7a72305820aeb8de14cc0e518ec11728cec49485058078830670ba8ae16644f4af79ba21270029'

describe('Nicks Method', () => {
  describe('generateTx', () => {
    it('generates a usable transaction', async () => {
      const [account] = await ethers.getSigners()
      const tx = generateTx(
        bytecode,
        `0x${Buffer.from(ethers.utils.randomBytes(16)).toString('hex')}`,
        800000,
        100000000000
      )

      await account.sendTransaction({
        to: EthereumUtil.bufferToHex(tx.from),
        value: '800000000000000000',
      })

      await ethers.provider.sendTransaction(
        EthereumUtil.bufferToHex(tx.serialize())
      )
    })
  })

  describe('decorateTx', () => {
    let tx

    beforeEach(() => {
      tx = generateTx(
        bytecode,
        `0x${Buffer.from(ethers.utils.randomBytes(16)).toString('hex')}`,
        800000,
        100000000000
      )
    })

    it('attaches sender information', async () => {
      const decorated = decorateTx(tx)

      assert.equal(decorated.from, EthereumUtil.bufferToHex(tx.from))
    })

    it('attaches recipient information', async () => {
      const decorated = decorateTx(tx)

      assert.equal(
        decorated.to,
        EthereumUtil.bufferToHex(
          EthereumUtil.generateAddress(tx.from, tx.nonce)
        )
      )
    })
  })
})
