import { EcoResponse } from "../../common/eco-response"

export interface EcoSecretsManager {
  init: (options: any) => Promise<EcoResponse<any>>
  createSecret: (name: string, value: string) => Promise<EcoResponse<string>>
  readSecret: (secretID: string) => Promise<EcoResponse<string>>
  deleteSecret: (secretID: string) => Promise<EcoResponse<any>>
}