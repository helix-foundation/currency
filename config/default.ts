export default {
  SecretsManager: {
    enabled: true,

    options: {
      apiVersion: '2017-10-17',
      region: 'us-east-1',

      credentials: {
        accessKeyId: 'TBD',
        secretAccessKey: 'TBD',
      },
    },
  },

  Supervisor: {
    'secure:privateKey': 'TBD',
  }
}
