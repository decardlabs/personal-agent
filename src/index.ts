import { createLogger } from './observability/logger.js'
import { initializeDatabase } from './storage/db.js'
import { getCurrentState } from './agent/stateMachine.js'

async function main(): Promise<void> {
  const logger = createLogger()
  const db = initializeDatabase()

  logger.info({ state: getCurrentState() }, 'personal-assistant bootstrap complete')

  const row = db
    .prepare('SELECT count(*) AS count FROM sqlite_master WHERE type = ?')
    .get('table') as { count: number }

  logger.info({ tableCount: row.count }, 'database connected')
}

main().catch(error => {
  const logger = createLogger()
  logger.error({ error }, 'fatal startup error')
  process.exit(1)
})
