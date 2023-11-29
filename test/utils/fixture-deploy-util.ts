import { Contract, ContractFactory, Signer } from 'ethers'
import { ForwardProxy__factory } from '../../typechain-types/factories/contracts/proxy'

/**
 * Deploy a contract with the given factory from a certain address
 * Will be deployed by the given deployer address with the given params
 */
export async function deploy<F extends ContractFactory>(
  from: Signer,
  FactoryType: { new (from: Signer): F },
  params: any[] = []
): Promise<Contract> {
  const factory = new FactoryType(from)
  const contract = await factory.deploy(...params)
  await contract.deployed()

  return contract
}

/**
 * Deploy a proxied contract with the given factory from a certain address
 * Will be deployed with the given params
 */
export async function deployProxy<F extends ContractFactory>(
  from: Signer,
  FactoryType: { new (from: Signer): F },
  params: any[] = []
): Promise<[Contract, Contract]> {
  const factory = new FactoryType(from)
  const base = await factory.deploy(...params)
  await base.deployed()
  const proxy = await new ForwardProxy__factory(from).deploy(base.address)
  await proxy.deployed()

  return [factory.attach(proxy.address), base]
}
