import * as config from 'config'
import { EcoResponse } from '../common/eco-response'
import { asyncForEach, isObject } from '../common/utils'
import { SecretsManagerService } from './secrets-manager.service'

export class EcoConfigService {
    //   private logger = new Logger('EcoConfigService')
    private ecoConfig: any
    private secretsManagerConfig: any
    private secretsManagerEnabled: boolean
    private secretsManagerInitialized!: Promise<object>

    constructor(
        private secretsManager: SecretsManagerService,
    ) {
        this.ecoConfig = config
        this.secretsManagerConfig = this.ecoConfig.SecretsManager
        this.secretsManagerEnabled = this.secretsManagerConfig.enabled
    }

    getConfig(): any {
        return this.ecoConfig
    }

    isSecureValue(key: string): string {
        const [keyPrefix, keyValue] = key.split(':')
        if (keyValue && (keyPrefix === 'secure')) {
            return keyValue
        }

        return ""
    }

    private async initializeSecretsManager(): Promise<object> {
        if (this.secretsManagerEnabled) {
            await this.secretsManager.init(this.secretsManagerConfig.options)
        }

        this.secretsManagerInitialized = this.fetchSecureValues()
       
        const res = await this.secretsManagerInitialized
        return res
    }

    async secretsManagerInitializationComplete(): Promise<void> {
        if (this.secretsManagerInitialized) {
            // this.logger.debug({ msg: `secrets manager initialization already in progress` })
            await this.secretsManagerInitialized
            return
        }

        // this.logger.debug({ msg: `Initializing secrets manager` })
        this.secretsManagerInitialized = this.initializeSecretsManager()
        this.ecoConfig = await this.secretsManagerInitialized
    }

    private async fetchSecureValues(): Promise<object> {
        return this._fetchSecureValues(this.ecoConfig, [])
    }

    async _fetchSecureValues(configObject: Record<string, any>, prefixes: string[]): Promise<object> {
        let res : Record<string, any> = new Object()
        await asyncForEach<string>(Object.keys(configObject), async (key) => {

            let value = configObject[key]

            if (isObject(value)) {
                value = await this._fetchSecureValues(value, [...prefixes, key])
                res[key] = value
                return
            }

            const baseKey = this.isSecureValue(key)
            if (baseKey) {

                const fqKey = [...prefixes, baseKey].join('/')

                if (this.secretsManagerEnabled) {
                    const { response: secureValue, error } = await this.getSecureConfigValue(fqKey)


                    if (error || !secureValue) {
                        if (error) {
                            // this.logger.error({ msg: `_fetchSecureValues`, error })
                        }

                        // this.logger.warn({ msg: `secret not found in secrets manager, using default value for: ${fqKey}` })
                    } else {
                        value = secureValue
                    }
                }

                delete res[key]
                res[baseKey] = value
            }
        })

        return res
    }

    async getSecureConfigValue(key: string): Promise<EcoResponse<string>> {
        return this.secretsManager.readSecret(key)
    }
}
