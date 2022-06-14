/* eslint-disable no-console */

// THIS IS FOR USE IN TESTNET TESTING
const bip39 = require('bip39');
const ethers = require('ethers');

const mnemonic = bip39.generateMnemonic();

const wallet = ethers.Wallet.fromMnemonic(mnemonic);

console.log(`private key: ${wallet.signingKey.privateKey}`);
console.log(`address: ${wallet.signingKey.address}`);
