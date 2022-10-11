const { ethers, utils, BigNumber } = require("ethers");

const { answer, getTree } = require('./tools/randomInflationUtils');
const fs = require('fs');
const BN = require('bn.js');

const importPath = "currency/artifacts";

const {
    getCommit,
    getFormattedBallot,
  } = require('./tools/test/currencyGovernanceVote')

const PolicyABI = require(`../${importPath}/contracts/policy/Policy.sol/Policy.json`);
const PolicyTestABI = require(`../${importPath}/contracts/test/Backdoor.sol/PolicyTest.json`);
const PolicyInitABI = require(`../${importPath}/contracts/policy/PolicyInit.sol/PolicyInit.json`);
const EcoBootstrapABI = require(`../${importPath}/contracts/deploy/EcoBootstrap.sol/EcoBootstrap.json`);
const EcoInitializableABI = require(`../${importPath}/contracts/deploy/EcoInitializable.sol/EcoInitializable.json`);
const TimedPoliciesABI = require(`../${importPath}/contracts/governance/TimedPolicies.sol/TimedPolicies.json`);
const TrustedNodesABI = require(`../${importPath}/contracts/governance/monetary/TrustedNodes.sol/TrustedNodes.json`);
const rootHashProposalABI = require(`../${importPath}/contracts/governance/monetary/InflationRootHashProposal.sol/InflationRootHashProposal.json`);
const InflationContractABI = require(`../${importPath}/contracts/governance/monetary/RandomInflation.sol/RandomInflation.json`);
const CurrencyGovernanceABI = require(`../${importPath}/contracts/governance/monetary/CurrencyGovernance.sol/CurrencyGovernance.json`);
const CurrencyTimerContractABI = require(`../${importPath}/contracts/governance/CurrencyTimer.sol/CurrencyTimer.json`);
const LockupContractABI = require(`../${importPath}/contracts/governance/monetary/Lockup.sol/Lockup.json`);
const PolicyProposalContractABI = require(`../${importPath}/contracts/governance/community/PolicyProposals.sol/PolicyProposals.json`);
const PolicyVotesContractABI = require(`../${importPath}/contracts/governance/community/PolicyVotes.sol/PolicyVotes.json`);
const ECOxStakingContractABI = require(`../${importPath}/contracts/governance/community/ECOxStaking.sol/ECOxStaking.json`);
const ECOABI = require(`../${importPath}/contracts/currency/ECO.sol/ECO.json`);
// const IERC20ABI = require(`../${importPath}/contracts/IERC20.json`);
const EcoFaucetABI = require(`../${importPath}/contracts/deploy/EcoFaucet.sol/EcoFaucet.json`);
const EcoTestCleanupABI = require(`../${importPath}/contracts/deploy/EcoTestCleanup.sol/EcoTestCleanup.json`);
// const EcoTokenInitABI = require(`../${importPath}/contracts/currency/EcoTokenInit.sol/EcoTokenInit.json`);
// const EcoXTokenInitABI = require(`../${importPath}/contracts/currency/EcoXTokenInit.sol/EcoXTokenInit.json`);
const VDFVerifierABI = require(`../${importPath}/contracts/VDF/VDFVerifier.sol/VDFVerifier.json`);
const ECOxABI = require(`../${importPath}/contracts/currency/ECOx.sol/ECOx.json`);
const ECOxStakingABI = require(`../${importPath}/contracts/governance/community/ECOxStaking.sol/ECOxStaking.json`);
const TrusteeReplacementABI = require(`../${importPath}/contracts/governance/community/TrusteeReplacement.propo.sol/TrusteeReplacement.json`);

// const provider = new ethers.providers.JsonRpcProvider("https://kovan.infura.io/v3/b2eb74fe7b1847f29a35c8bdb93c0e84");
const provider = new ethers.providers.JsonRpcProvider("https://goerli.infura.io/v3/b9ee89f0173e49bf934ba96531bae79c");

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";

const accountsBalances = []; // paste this from the subgraph accounts array

const totalSum = new BN('110000000000000000000000000');
const amountOfAccounts = 3;
let map;

const cumulativeSum = (sum => value => sum =  sum.add(value))(BigNumber.from(0));

const accountsSums = accountsBalances.filter(balance => balance.address !== NULL_ADDRESS).sort((a, b) => a.address.localeCompare(b.address)).map(balance => BigNumber.from(balance.ECO)).map(cumulativeSum);

// const tree = getTree(accountsSums);

//console.log(accountsSums);

const accounts = [
    {},
    {   
        address: "0xa3294e61492129c0629352ccbf1d0aa81c4a0d6e",
        signer: new ethers.Wallet("0x6f043a2c917fe06035f004dc6bb5fe7c73af4b89a040092b770f5cbe24f4be2d", provider)
    },
    {   
        address: "0xEdb4b561b92d843996dd23C8f4aBb861269bC447",
        signer: new ethers.Wallet("0x0594bfd43a475db159a261a7222774d0f269498588cce7d3bae2aa52817c7cb4", provider)
    },
    // {   
    //     address: "0xa1B0Fff8876358CA1aad5eAb7f9040617B0fc6d8",
    //     signer: new ethers.Wallet("0x5a309c05ab231b4c38df91b3cdc4df8bf946cc5e61fb118dc35d5fa9bc255ad3", provider)
    // },
    // {   
    //     address: "0xB580168873920e11EC20e801f755A9Eb73f01770",
    //     signer: new ethers.Wallet("0x1b9d1c6fba781ddbe458347fd70878615a3dea8abdcba92961160a4d7df9a21d", provider)
    // },
    // {   
    //     address: "0x07295ed67eb39E448451E480969ae81Fe97aA6eE",
    //     signer: new ethers.Wallet("0x1025cd048a7f31b61bc54048929c49a54733c0181f55b408ed122a91f613503f", provider)
    // },
    // {
    //     address: "0x9399b668F065E89a4971001C4670F83c1cEfA3F7",
    //     signer: new ethers.Wallet("0xaf9eb2ce3778dde25d1e1370d17f5ed9fa25decb54c1e2a5e1220f5471e468df", provider)
    // }
]

const contracts = {
    "policy": "0x569632807b52a7d5b276ac2ca9a3fc5018060bc2",
    "trustedNodes": "0x9cdd0e5fe06c96853fab30d533234e6f7db5c5f8",
    "eco": "0x98a90b68b6dae4216f532a3e839aa868c91686f3",
    // "ecox": "0xd392678beaf12b24991949e3544a7d80557e0e32",
    // "ecoxStaking": "0xe91dab0306634aedc163229099997b3311f4a72f",
    // "currencyTimer": "0x58cdaeead5508d7dc8c3c0659d916a3b5f3273b0",
    "timedPolicies": "0x18c6397a49d887e31973c85c0683cb87da192473",
    "policyProposals": "0x306ee7ff8e37de1a55f12262b9cda1379bdf6603",
    "policyVotes": "0xff2baF9db90BBDCce3eC1A1db3Ae3f66AC599975",
    "currencyGovernance": "0xf874d12de2753e796adf0b04c52ec770908a344a",
    // "lockupVaultFactory": "0xf6d82882b9ae041760ffa8c879a4e9ce10710b5a",
    // "lockupVault": "",
    // "fundsLockup": "0xcdbb56abf0ca46c6139dbff926a4f2018fa6370f",
    // "randomInflation": "",
    "newProposal": "0x7D971EE0Cc1a5E7Ae6F2C46965F783F8D74f652A"
}

let randomBytes = []


async function runtest() {
    const blockNumber = await provider.getBlockNumber();

    const seeds = [
                    [],
                    [191,59,141,236,8,54,182,202,100,57,159,96,188,201,215,8,147,28,110,189,133,87,4,220,27,45,65,40,179,241,133,106],
                    []
    ]
    let tx, contract;

    async function checkTrustees() {
        contract = new ethers.Contract(contracts.trustedNodes, TrustedNodesABI.abi, accounts[1].signer)
        const cohort = await contract.cohort()
        console.log(await contract.getTrustedNodesFromCohort(cohort))
    }

    async function whatever() {
        // create proposal
        const factory = new ethers.ContractFactory(
            TrusteeReplacementABI.abi,
            TrusteeReplacementABI.bytecode,
            accounts[1].signer
          );
        
        contract = await factory.deploy([accounts[2].address])
        console.log(contract.address)
        console.log(await contract.returnNewTrustees())

        // contract = new ethers.Contract(contracts.policyProposals,PolicyProposalContractABI.abi, accounts[1].signer)
        // console.log(BN(await contract.proposalToConfigure()));

        // check voting time
        // contract = new ethers.Contract(contracts.policyVotes, PolicyVotesContractABI.abi, accounts[1].signer)
        
        // console.log((await contract.voteEnds()).toNumber() + (await contract.ENACTION_DELAY()).toNumber())

        // see trustedNodeAddition events
        contract = new ethers.Contract(contracts.trustedNodes, TrustedNodesABI.abi, accounts[1].signer)

        console.log((await contract.numTrustees()).toNumber())

        // let filter = contract.filters.TrustedNodeAddition()
        // let events = await contract.queryFilter(filter, -1000)
        // console.log(events)

        
    }
    // monetary governance

    async function proposeCurrencyGovernance() {
        contract = new ethers.Contract(contracts.currencyGovernance, CurrencyGovernanceABI.abi, accounts[1].signer)
        tx = await contract.propose(10, 11, 12, 13, BigNumber.from('1000000000000000000'), '')
        tx = await tx.wait();
        if (tx.status == 1) {
            console.log(`currency governance proposed by ${accounts[1].address}`)
        }
    }

    async function commit(i) {
        contract = new ethers.Contract(contracts.currencyGovernance, CurrencyGovernanceABI.abi, accounts[i].signer)
        // const temp = ethers.utils.randomBytes(32)
        const temp = seed
        tx = await contract.commit(
            getCommit(temp, accounts[1].address, [accounts[1].address]),
            {gasLimit: 2_000_000}
        )
        tx = await tx.wait();
        if (tx.status == 1) {
            console.log(`vote committed by ${accounts[i].address} with seed ${temp}`)
            //copy the seed into the corresponding index in the seeds object, this will be necessarily for reveal phase
        }
    }

    async function reveal(i) {
        contract = new ethers.Contract(contracts.currencyGovernance, CurrencyGovernanceABI.abi, accounts[i].signer)
        tx = await contract.reveal(
            seed[i],
            getFormattedBallot([accounts[i].address]),
            {gasLimit: 2_000_000}
        )
        tx = await tx.wait();
        if (tx.status == 1) {
            console.log(`vote revealed by ${accounts[i].address}`)
        }
    }


    // community governance
    async function deployProposal() {
        const factory = new ethers.ContractFactory(
            TrusteeReplacementABI.abi,
            TrusteeReplacementABI.bytecode,
            accounts[1].signer
          );
        
        contract = await factory.deploy([accounts[2].address])
        console.log(contract.address)
        console.log(await contract.returnNewTrustees())
    }

    async function registerProposal() {
        ecoContract = new ethers.Contract(contracts.eco, ECOABI.abi, accounts[1].signer)
        contract = new ethers.Contract(contracts.policyProposals, PolicyProposalContractABI.abi, accounts[1].signer)
        
        const registrationCost = await contract.COST_REGISTER()
        let tx = await ecoContract.approve(contracts.policyProposals, registrationCost)
        tx = await tx.wait();
        if (tx.status == 1) {
            console.log(`approved for ${registrationCost}`)
        }
        
        tx = await contract.registerProposal(contracts.newProposal, {gasLimit: 2_000_000})
        tx = await tx.wait();
        if (tx.status == 1) {
            console.log('registered proposal')
        }
    }

    async function support(i) {
        ecoContract = new ethers.Contract(contracts.eco, ECOABI.abi, accounts[i].signer)
        contract = new ethers.Contract(contracts.policyProposals, PolicyProposalContractABI.abi, accounts[i].signer)

        tx = await contract.support(contracts.newProposal, {gasLimit: 2_000_000})
        tx = await tx.wait();
        console.log(tx.status === 1,i);
    }

    async function deployVoting() {
        contract = new ethers.Contract(contracts.policyProposals, PolicyProposalContractABI.abi, accounts[i].signer)

        tx = await contract.deployProposalVoting({gasLimit: 2_000_000})
        console.log(tx.status === 1);
    }

    async function doVote(i, bool) {
        contract = new ethers.Contract(contracts.policyVotes, PolicyVotesContractABI.abi, accounts[i].signer)

        tx = await contract.vote(bool, {gasLimit: 2_000_000})
        tx = await tx.wait();
        if (tx.status) {
            console.log(`${accounts[i]} has voted ${bool}`)
        }
    }

    async function incrementGeneration() {
        contract = new ethers.Contract(contracts.timedPolicies, TimedPoliciesABI.abi)
        contract.connect(accounts[1].signer)

        tx = await contract.connect(accounts[1].signer).incrementGeneration()
        tx = await tx.wait();
        if (tx.status) {
            console.log('incremented generation')
        }
    }

    // incrementGeneration();
    // checkTrustees();

    //****** community governance *****
    // deployProposal();
    // registerProposal();
    // support(1);
    // support(2);
    // support(3);
    // doVote(1, true);
    // doVote(2, false);
    // doVote(3, true);

    // **** monetary governance *****
    // proposeCurrencyGovernance();
    // commit(1);
    // commit(2);
    // commit(3);
    // reveal(1);
    reveal(2);
    // reveal(3);

    

}
runtest();


function toBigNumber(num) {
    return utils.parseUnits(num.toString());
}

function toNumber(bignum) {
    return utils.formatUnits(bignum);
}

function currentTime() {
    return Math.round(Date.now() / 1000);
}

function generateHash(sortedList = [], votingAccount) {
    // generate seed
    const sd = BigNumber.from(utils.randomBytes(32)).toHexString();
    console.log("seed: ", sd);
    
    // map selection to trustee addresses
    const vt = sortedList.map((p) => p.address);
    console.log("vote: ", vt);

    // generate hash
    const hsh = utils.solidityKeccak256(
        ['bytes32', 'address', 'address[]'],
        [sd, votingAccount.address, vt]
    );

    return hsh;
}

// function getRecipient(claimNumber) {
//     if (new BN(claimNumber) === 0) {
//         return [0, accounts[0]];
//     }
//     let index = accountsSums.findIndex((element) =>
//         element.gt(new BigNumber.from(claimNumber))
//     );
//     index = index === -1 ? 2 : index - 1;
//     return [index, accounts[index]];
// }

// async function getClaimParameters(inf, sequence) {
//     const chosenClaimNumberHash = ethers.utils.solidityKeccak256(
//     ['bytes32', 'uint256'],
//     [await inf.seed(), sequence]
//     );
//     const [index, recipient] = getRecipient(
//     BigNumber.from(chosenClaimNumberHash.slice(2), 16).mod(BigNumber.from(totalSum))
//     );
//     return [answer(tree, index), index, recipient];
// }