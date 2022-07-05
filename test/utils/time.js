const hre = require('hardhat');

const { ethers } = hre;

exports.setNextBlockTimestamp = async (timestamp) => {
  await ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
};

exports.latestBlock = async () => {
  const res = await hre.network.provider.send('eth_getBlockByNumber', ['latest', false]);
  return parseInt(res.number, 16);
};

exports.latestBlockHash = async () => {
  const res = await hre.network.provider.send('eth_getBlockByNumber', ['latest', false]);
  return res.hash;
};

exports.increase = async (seconds) => {
  await hre.network.provider.send('evm_increaseTime', [seconds]);
  await hre.network.provider.send('evm_mine');
};

exports.advanceBlock = async () => {
  await hre.network.provider.send('evm_mine');
};

exports.secondsFromNow = async (secondsFromNow) => {
  const res = await hre.network.provider.send('eth_getBlockByNumber', ['latest', false]);
  const timestamp = parseInt(res.timestamp, 16);
  return timestamp + secondsFromNow;
};
