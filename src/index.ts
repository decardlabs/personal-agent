import { createLogger } from './observability/logger.js'
import { initializeDatabase } from './storage/db.js'
import { getCurrentState } from './agent/stateMachine.js'
import { SessionEventRepository } from './storage/sessionEventRepository.js'
import { runTurn } from './agent/runTurn.js'
import { applyMigrations } from './storage/migrate.js'

async function main(): Promise<void> {
  const logger = createLogger()
  const db = initializeDatabase()
  applyMigrations(db)
  const repository = new SessionEventRepository(db)

  logger.info({ state: getCurrentState() }, 'personal-assistant bootstrap complete')

  const row = db
    .prepare('SELECT count(*) AS count FROM sqlite_master WHERE type = ?')
    .get('table') as { count: number }

  logger.info({ tableCount: row.count }, 'database connected')

  const input = process.argv.slice(2).join(' ') || 'echo hello world'
  const result = runTurn(input, repository)
  const events = repository.listByTurn(result.sessionId, result.turnId)

  logger.info(
    {
      sessionId: result.sessionId,
      turnId: result.turnId,
      response: result.response,
      eventCount: events.length,
      state: getCurrentState(),
    },
    'turn executed',
  )
}

main().catch(error => {
  const logger = createLogger()
  logger.error({ error }, 'fatal startup error')
  process.exit(1)
})
