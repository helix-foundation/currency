// @ts-nocheck
import { Contract, Signer } from 'ethers'
import hre from 'hardhat'

/**
 * Deploy a contract with the given artifact name
 * Will be deployed with the given params
 */
export async function deploy(
  contractName: string,
  ...params: any[]
): Promise<Contract> {
  const factory = await hre.ethers.getContractFactory(contractName)
  if (params) {
    return factory.deploy(...params)
  }
  return factory.deploy()
}

/**
 * Deploy a contract with the given artifact name from a certain address
 * Will be deployed by the given deployer address with the given params
 */
export async function deployFrom(
  from: Signer,
  contractName: string,
  ...params: any[]
): Promise<Contract> {
  const factory = await hre.ethers.getContractFactory(contractName, from)
  if (params) {
    return factory.deploy(...params)
  }
  return factory.deploy()
}

export async function deployProxy(
  contractName: string,
  params: any[]
): Promise<Contract> {
  const base = await exports.deploy(contractName, params)
  const proxy = await exports.deploy('ForwardProxy', base.address)
  return hre.ethers.getContractAt(contractName, proxy.address)
}
