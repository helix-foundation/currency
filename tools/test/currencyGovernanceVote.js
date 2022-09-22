const { ethers } = require('ethers')

const hash = (x) =>
  ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['bytes32', 'address', '(address proposal, uint256 score)[]'],
      [x[0], x[1], x[2]]
    )
  )

function getCommit(seed, senderAddress, ballot) {
  const sortedBallotObj = getFormattedBallot(ballot)
  return hash([seed, senderAddress, sortedBallotObj])
}

function getFormattedBallot(ballot) {
  const ballotObj = ballot.map((address, index, array) => {
    return { proposal: address.toLowerCase(), score: array.length - index }
  })
  return ballotObj.sort((a, b) => a.proposal.localeCompare(b.proposal))
}

module.exports = {
  hash,
  getFormattedBallot,
  getCommit,
}
