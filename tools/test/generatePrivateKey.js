/* eslint-disable no-console, no-underscore-dangle */

// THIS IS FOR USE IN TESTNET TESTING
const ethers = require('ethers')

const wallet = ethers.Wallet.createRandom()

console.log(`private key: ${wallet._signingKey().privateKey}`)
