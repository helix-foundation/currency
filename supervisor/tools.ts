import { logError, SupervisorError } from './logError'
import * as ethers from 'ethers'

export const fetchLatestBlock = async (provider: ethers.providers.BaseProvider) => {
    let errors: any = []
    for (let i = 0; i < 3; i++) {
      try {
        return await provider.getBlock('latest')
      } catch (e) {
        errors.push(e)
        continue
      }
    }
    logError({
      type: SupervisorError.InfuraIssue,
      error: errors
    })
    throw new Error('Infura Issue')
  }