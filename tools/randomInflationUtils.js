/* eslint no-bitwise: 0 */
/* eslint no-param-reassign: 0 */
/* eslint no-await-in-loop: 0 */
/* eslint prefer-destructuring: 0 */

const { BigNumber } = require('ethers')
const bigintCryptoUtils = require('bigint-crypto-utils')

/*
 * Takes an array of sorted items and recursively builds an merkle tree
 */

function arrayToTree(items, min, max, maxFilled) {
  let index
  let sum
  if (min > maxFilled) {
    return {
      hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
    }
  }
  if (min === max) {
    if (items[min][0] === ethers.constants.AddressZero) {
      index = 0
      sum = 0
    } else {
      index = min
      sum = items[min][2]
    }
    return {
      account: items[min][0],
      balance: items[min][1],
      sum,
      index,
      hash: ethers.utils.solidityKeccak256(
        ['bytes20', 'uint256', 'uint256', 'uint256'],
        [items[min][0], items[min][1], items[min][2], index]
      ),
    }
  }
  const spread = Math.floor((max - min) / 2)
  const a = arrayToTree(items, min, min + spread, maxFilled)
  const b = arrayToTree(items, max - spread, max, maxFilled)
  const params = [a.hash, b.hash]
  return {
    left: a,
    right: b,
    hash: ethers.utils.solidityKeccak256(
      ['bytes32', 'bytes32'],
      [params[0], params[1]]
    ),
  }
}

/*
 * Takes a map of accounts and balances and returns a merkle tree of it
 *
 */
function getTree(map, wrongSum = [], swapIndex = []) {
  const items = []
  // eslint-disable-next-line no-restricted-syntax
  for (const i of map) {
    items.push(i)
  }

  items.sort((a, b) => Number(a[0] - b[0]))

  if (swapIndex.length > 0) {
    const b = items[swapIndex[0]]
    items[swapIndex[0]] = items[swapIndex[1]]
    items[swapIndex[1]] = b
  }

  const len = items.length

  const wantitems = 2 ** Math.ceil(Math.log2(len))
  let sum = BigNumber.from(0)
  for (let i = 0; i < len; i += 1) {
    if (wrongSum.length > 0) {
      if (i === wrongSum[0]) {
        sum = BigNumber.from(wrongSum[1])
      }
    }

    items[i].push(sum)
    sum = sum.add(BigNumber.from(items[i][1]))
  }

  const r = arrayToTree(items, 0, wantitems - 1, items.length - 1)
  r.items = len
  r.total = sum
  return r
}

function answer(tree, index) {
  const r = []
  const bits = Math.ceil(Math.log2(tree.items))

  let node = tree
  for (let b = bits - 1; b >= 0; b -= 1) {
    const right = (index & (1 << b)) !== 0
    if (right) {
      r.push(node.left.hash)
      node = node.right
    } else {
      r.push(node.right.hash)
      node = node.left
    }
  }

  return [node, r]
}

function getRandomIntInclusive(min, max) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min + 1)) + min // The maximum is inclusive and the minimum is inclusive
}

function shiftWithinRange(x, max) {
  if (x === max) {
    x -= 1
    return x
  }
  x += 1
  return x
}

function getRandomIntInclusiveEven(min, max) {
  const x = getRandomIntInclusive(min, max)
  if (x % 2 !== 0) {
    return shiftWithinRange(x, max)
  }
  return x
}

function getRandomIntInclusiveOdd(min, max) {
  const x = getRandomIntInclusiveEven(min, max)
  return shiftWithinRange(x, max)
}

async function getPrimal(blockHash) {
  const baseNum = BigNumber.from(blockHash)
  for (let i = 1; i < 1000; i++) {
    if (
      await bigintCryptoUtils.isProbablyPrime(
        BigInt(baseNum.add(i).toString()),
        30
      )
    ) {
      return baseNum.add(i).toString()
    }
  }
  return -1
}

module.exports = {
  getTree,
  answer,
  getRandomIntInclusive,
  getRandomIntInclusiveEven,
  getRandomIntInclusiveOdd,
  getPrimal,
}
