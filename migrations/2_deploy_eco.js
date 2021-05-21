const {
  ERC1820_REGISTRY_ABI,
  ERC1820_REGISTRY_ADDRESS,
  ERC1820_REGISTRY_DEPLOY_TX,
} = require('@openzeppelin/test-helpers/src/data');

module.exports = async function(deployer, network, [alice]) {
  const { BN, toWei } = web3.utils;

  // Deploy ERC1820
  await web3.eth.sendTransaction({ from: alice, to: '0xa990077c3205cbDf861e17Fa532eeB069cE9fF96', value: new BN(toWei('0.08', 'ether')), gasPrice: 0 });
  await web3.eth.sendSignedTransaction(ERC1820_REGISTRY_DEPLOY_TX);
}
