const hre = require('hardhat')
const { deployContract } = require('ethereum-waffle')

/**
 * Deploy a contract with the given artifact name
 * Will be deployed by the given deployer address with the given params
 */
exports.deploy = async (contractName, ...params) => {
  const factory = await hre.ethers.getContractFactory(contractName)
  if (params) {
    return factory.deploy(...params)
  }
  return factory.deploy()
}

/**
 * Deploy a contract with the given artifact name
 * Will be deployed by the given deployer address with the given params
 */
exports.deployFrom = async (from, contractName, ...params) => {
  const artifact = await hre.artifacts.readArtifact(contractName)
  if (params) {
    return deployContract(from, artifact, params)
  }
  return deployContract(from, artifact)
}

exports.deployProxy = async (contractName, params) => {
  const base = await exports.deploy(contractName, params)
  const proxy = await exports.deploy('ForwardProxy', base.address)
  return hre.ethers.getContractAt(contractName, proxy.address)
}
