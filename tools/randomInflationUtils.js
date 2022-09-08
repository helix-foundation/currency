/* eslint no-bitwise: 0 */
/* eslint no-param-reassign: 0 */
/* eslint no-await-in-loop: 0 */
/* eslint prefer-destructuring: 0 */
/* eslint no-unused-vars: 0 */
/* eslint new-cap: 0 */

const bigintCryptoUtils = require('bigint-crypto-utils')
const BN = require('bn.js')
const web3 = require('web3')
const { ethers } = require('ethers')
// const time = require('../test/utils/time.ts');
/*
 * Takes an array of sorted items and recursively builds an merkle tree
 */

function arrayToTree(items, min, max) {
  let index
  let sum
  if (min === max) {
    if (items[min][0] === 0) {
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
      hash: web3.utils.soliditySha3(
        {
          t: 'bytes20',
          v: items[min][0].toString(),
        },
        {
          t: 'uint256',
          v: items[min][1],
        },
        {
          t: 'uint256',
          v: items[min][2],
        },
        {
          t: 'uint256',
          v: index,
        }
      ),
    }
  }
  const spread = Math.floor((max - min) / 2)
  const a = arrayToTree(items, min, min + spread)
  const b = arrayToTree(items, max - spread, max)
  const params = [a.hash, b.hash]
  // web3.utils.toBN(a.hash).lt(web3.utils.toBN(b.hash)) ? [a.hash, b.hash] : [b.hash, a.hash];
  return {
    left: a,
    right: b,
    hash: web3.utils.soliditySha3(
      {
        t: 'bytes32',
        v: params[0],
      },
      {
        t: 'bytes32',
        v: params[1],
      }
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
  for (let i = len; i < wantitems; i += 1) {
    items.push([0, 0])
  }
  let sum = new web3.utils.BN(0)
  for (let i = 0; i < len; i += 1) {
    if (wrongSum.length > 0) {
      if (i === wrongSum[0]) {
        sum = web3.utils.toBN(wrongSum[1])
      }
    }

    items[i].push(sum)
    sum = sum.add(items[i][1])
  }
  for (let i = len; i < wantitems; i += 1) {
    items[i].push(0)
  }

  const r = arrayToTree(items, 0, items.length - 1)
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

async function getPrimal(blockHash, attempts = 0) {
  const baseNum = new BN(blockHash.slice(2), 16)
  for (let i = 0; i < 1000; i++) {
    if (
      await bigintCryptoUtils.isProbablyPrime(
        BigInt(baseNum.addn(i).toString()),
        30
      )
    ) {
      return baseNum.addn(i).toString()
    }
  }
  if (attempts > 2) {
    return
  }
  return getPrimal(blockHash, ++attempts)
}

function getRecipient(orderedBalanceSums, orderedAddresses, claimNumber) {
  console.log('getrecipient')
  if (new BN(claimNumber) === 0) {
    return [0, 0x0]
  }
  let index = orderedBalanceSums.findIndex((element) =>
    element.gt(new BN(claimNumber))
  )
  index = index === -1 ? 2 : index - 1
  return [index, orderedAddresses[index]]
}

async function getClaimParameters(
  seed,
  tree,
  sequence,
  totalSum,
  orderedBalanceSums,
  orderedAddresses
) {
  console.log('getclaimparameters')
  const chosenClaimNumberHash = ethers.utils.solidityKeccak256(
    ['bytes32', 'uint256'],
    [seed, sequence]
  )
  console.log(chosenClaimNumberHash)
  const [index, recipient] = await getRecipient(
    orderedBalanceSums,
    orderedAddresses,
    new BN(chosenClaimNumberHash.slice(2), 16).mod(new BN(totalSum))
  )
  return [await answer(tree, index), index, recipient]
}

module.exports = {
  getClaimParameters,
  getTree,
  getPrimal,
  answer,
  getRandomIntInclusive,
  getRandomIntInclusiveEven,
  getRandomIntInclusiveOdd,
}
