import { EcoResponse } from '../common/eco-response'


import {
  CreateSecretCommand,
  CreateSecretCommandInput,
  GetSecretValueCommand,
  GetSecretValueCommandInput,
  GetSecretValueCommandOutput,
  PutSecretValueCommand,
  PutSecretValueCommandInput,
  SecretsManagerClient,
  SecretsManagerClientConfig,
} from '@aws-sdk/client-secrets-manager'
import { EcoSecretsManager } from './interfaces/EcoSecretsManager'


export class SecretsManagerService implements EcoSecretsManager {
  private client!: SecretsManagerClient

  constructor(
  ) {
  }

  async init(
    configuration: SecretsManagerClientConfig,
  ): Promise<EcoResponse<any>> {

    this.client = new SecretsManagerClient(configuration)
    return {}
  }

  async createSecret(
    name: string,
    value: string,
  ): Promise<EcoResponse<string>> {

    const input: CreateSecretCommandInput = {
      Name: name,
      SecretString: value,
    }

    const command = new CreateSecretCommand(input)

    try {
      const data = await this.client.send(command)
      // this.logger.debug({ msg: `createSecret`, data })
      const { ARN } = data
      return { response: ARN }
      // process data.
    } catch (ex) {
      const error = ex
      return { error }
    }
  }

  async readSecret(
    secretID: string,
  ): Promise<EcoResponse<string>> {

    try {
      const input: GetSecretValueCommandInput = {
        SecretId: secretID,
      }

      const command = new GetSecretValueCommand(input)
      const data: GetSecretValueCommandOutput = await this.client.send(command)
      // this.logger.debug({ msg: `readSecret`, data })
      const { SecretString } = data
      return { response: SecretString }
      // process data.
    } catch (ex) {
      const error = ex

      return { error }
    }
  }

  async updateSecret(
    name: string,
    value: string,
  ): Promise<EcoResponse<string>> {

    const input: PutSecretValueCommandInput = {
      SecretId: name,
      SecretString: value,
    }

    const command = new PutSecretValueCommand(input)

    try {
      const data = await this.client.send(command)
      // this.logger.debug({ msg: `updateSecret`, data })
      const { ARN } = data
      return { response: ARN }
      // process data.
    } catch (ex) {
      const error = ex
      return { error }
    }
  }

  async deleteSecret(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    secretID: string,
  ): Promise<EcoResponse<any>> {

    return {}
  }
}
