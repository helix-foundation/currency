import { gql } from '@apollo/client'

type SubgraphBalance = {
  value: string
  blockNumber: string
}

type SubgraphAccount = {
  address: string
  ECOVotingPowers: SubgraphBalance[]
}

export type EcoSnapshotQueryResult = {
  accounts: SubgraphAccount[]
  inflationMultipliers: { value: string }[]
}

export const ECO_SNAPSHOT = gql`
  query EcoSnapshot($blockNumber: BigInt!) {
    accounts {
      address: id
      ECOVotingPowers: historicalVotingPowers(
        where: { token: "eco", blockNumber_lte: $blockNumber }
        orderBy: blockNumber
        orderDirection: desc
        first: 1
      ) {
        value
        blockNumber
      }
    }
    inflationMultipliers(
      where: { blockNumber_lte: $blockNumber }
      orderBy: blockNumber
      orderDirection: desc
      first: 1
    ) {
      value
    }
  }
`
