const hre = require('hardhat')

const { ethers } = hre

export async function setNextBlockTimestamp(timestamp: number) {
  await ethers.provider.send('evm_setNextBlockTimestamp', [timestamp])
}

export async function latestBlock() {
  const res = await hre.network.provider.send('eth_getBlockByNumber', [
    'latest',
    false,
  ])
  return parseInt(res.number, 16)
}

export async function latestBlockTimestamp() {
  const res = await hre.network.provider.send('eth_getBlockByNumber', [
    'latest',
    false,
  ])
  return res.timestamp
}

export async function latestBlockHash() {
  const res = await hre.network.provider.send('eth_getBlockByNumber', [
    'latest',
    false,
  ])
  return res.hash
}

export async function increase(seconds: number) {
  await hre.network.provider.send('evm_increaseTime', [seconds])
  await hre.network.provider.send('evm_mine')
}

export async function advanceBlock() {
  await hre.network.provider.send('evm_mine')
}

export async function advanceBlocks(blocks: number) {
  while (blocks > 0) {
    blocks--
    await advanceBlock()
  }
}

export async function secondsFromNow(secondsFromNow: number) {
  const res = await hre.network.provider.send('eth_getBlockByNumber', [
    'latest',
    false,
  ])
  const timestamp = parseInt(res.timestamp, 16)
  return timestamp + secondsFromNow
}

export default {
  setNextBlockTimestamp,
  latestBlock,
  latestBlockTimestamp,
  latestBlockHash,
  increase,
  advanceBlock,
  advanceBlocks,
  secondsFromNow,
}
