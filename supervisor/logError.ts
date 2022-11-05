/* eslint-disable no-unused-vars */
export enum SupervisorError {
  Fatal = 'Fatal error',
  LowEthBalance = 'Low ETH balance detected',
  LowEcoBalance = 'Low ECO balance detected',
  DeployVoting = 'Failed to deploy voting',
  Execute = 'Failed to execute community proposal',
  UpdateStage = 'Failed to update monetary governance stage',
  StartVDF = 'Failed to start VDF',
  VerifyVDF = 'Failed to verify VDF',
  SubmitVDF = 'Failed to submit VDF',
  ApproveInflationFee = 'Failed to approve inflation proposer fee',
  ProposeRootHash = 'Failed to propose root hash',
  RespondToChallenge = 'Failed to respond to root hash challenge',
  AnnualUpdate = 'Failed to complete annual update',
  IncrementGeneration = 'Failed to increment generation',
  CheckRootHashStatus = 'Failed to check root hash status',
  InfuraIssue = 'Failed to fetch latest block from infura, it may be down',
}

type LogErrorOptions = {
  type: SupervisorError
  error?: Error | any
  context?: any
  time?: Date
}

export const logError = async ({
  type,
  error = null,
  context = null,
  time = new Date(),
}: LogErrorOptions) => {
  console.log(`${type} | reported at ${time.toISOString()}`)
  if (error) {
    console.log(error.message)
  }
  if (context) {
    console.log('Context: ', context)
  }
  console.log('\n')
}
