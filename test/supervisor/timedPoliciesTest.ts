import * as hardhat from "hardhat"
import * as hre from "hardhat"
// import * as ethers from "ethers"
import { ethers } from "hardhat"
// const { ethers } = require('hardhat')
// const { expect } = require('chai')


// const { ethers } = require('hardhat')
// import { ethers } from "hardhat";
const time = require('../utils/time.ts')
import { Policy, TimedPolicies, TimedPolicies__factory } from "../../typechain-types"
import { testStartSupervisor } from "../../supervisor/supervisor_master"
import { EventFilter } from "ethers"

// import { Supervisor } from "./supervisorNew"


// const { BigNumber } = hardhat.ethers
const { ecoFixture, ZERO_ADDR } = require('../utils/fixtures')
const { deploy } = require('../utils/contracts')

async function increaseTime(seconds: number) {
  await time.increase(seconds);
}

describe('CurrencyGovernance [@group=4]', () => {
  let alice
  let bob
  let policy: Policy
  let ecox
  let timedPolicies: TimedPolicies
  let provider = hre.ethers.provider

//   const hash = (x) =>
//     ethers.utils.solidityKeccak256(
//       ['bytes32', 'address', 'address[]'],
//       [x[0], x[1], x[2]]
//     )
  const votingReward = '1000000000000000'
  // 76000000000000000

  before(async () => {
    const accounts = await ethers.getSigners();
    ;[alice, bob] = accounts;
    // console.log(alice);

    ({ policy, timedPolicies } =
      await ecoFixture())


    await testStartSupervisor(policy, alice);

  })

  it("increments generation at appropriate time", async () => {
    // let filter: EventFilter = timedPolicies.filters.NewGeneration()

    // console.log(`fixture timedPolicies is ${timedPolicies.address}`)
    // console.log((await timedPolicies.generation()).toNumber())
    console.log(await time.latestBlockTimestamp())
    // let generationTime: number = (await timedPolicies.GENERATION_DURATION()).toNumber()
    let nextGenStart: number = (await timedPolicies.nextGenerationStart()).toNumber()
    let timeToNextGeneration: number = nextGenStart - Math.floor(Date.now() / 1000)
    // console.log(timeToNextGeneration);
    // console.log((await timedPolicies.generation()).toNumber())
    // console.log(await time.latestBlockTimestamp())
    console.log((await (await provider.getBlock('latest')).number))
    // await time.increase(timeToNextGeneration + 20);
    // await setTimeout(increaseTime, 2000, 20)
    // await setTimeout(increaseTime, 2000, 20)
    // await setTimeout(increaseTime, 2000, 20)
    // console.log(await time.latestBlockTimestamp())
    // console.log((await timedPolicies.generation()).toNumber())
    for (let i = 0; i < 50; i++) {
      // await time.increase(timeToNextGeneration + 20)
      // let rc = await tx.wait()
      // console.log(tx);
      // if (true) {
      //   let hextime = await time.latestBlockTimestamp()
      //   console.log(Number(hextime))
      // }
      // console.log('clonk')
      await time.advanceBlock()
      console.log((await (await provider.getBlock('latest')).number))
    }
    // console.log(await time.latestBlockTimestamp())
    // console.log((await timedPolicies.generation()).toNumber())
    // await time.increase(timeToNextGeneration * 1000);
    // console.log((await timedPolicies.generation()).toNumber())
    // console.log(Math.floor(Date.now()/1000))

  })
})