import { Supervisor } from './supervisor'
import { logError, SupervisorError } from './logError'
;(async () => {
  const supervisor = new Supervisor()
  console.log('Starting Supervisor')
  try {
    await supervisor.start()
  } catch (err) {
    logError({
      type: SupervisorError.Fatal,
      error: err,
    })
  }
})()
