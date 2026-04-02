import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createLogger } from './observability/logger.js'
import { initializeDatabase } from './storage/db.js'
import { getCurrentState } from './agent/stateMachine.js'
import { SessionEventRepository } from './storage/sessionEventRepository.js'
import { runTurn } from './agent/runTurn.js'
import { applyMigrations } from './storage/migrate.js'
import { MemoryFactRepository } from './storage/memoryFactRepository.js'
import { PersistentMemoryStore } from './memory/persistentMemory.js'
import { createMemoryCoordinator } from './memory/memoryCoordinator.js'
import { ToolPermissionRepository } from './storage/toolPermissionRepository.js'
import { createOpenAIResponder } from './llm/openaiResponder.js'
import type { TurnOptions } from './agent/runTurn.js'

function parseInputArgs(argv: string[]): { input: string; hasInput: boolean } {
  const filtered = argv.filter(arg => arg !== '--approve-risky')
  const parsedInput = filtered.join(' ').trim()
  return {
    input: parsedInput || 'echo hello world',
    hasInput: parsedInput.length > 0,
  }
}

async function main(): Promise<void> {
  const logger = createLogger()
  const db = initializeDatabase()
  applyMigrations(db)
  const repository = new SessionEventRepository(db)
  const memoryRepository = new MemoryFactRepository(db)
  const persistentMemory = new PersistentMemoryStore(memoryRepository)
  const memory = createMemoryCoordinator(persistentMemory)
  const permissionRepository = new ToolPermissionRepository(db)

  logger.info({ state: getCurrentState() }, 'personal-assistant bootstrap complete')

  const row = db
    .prepare('SELECT count(*) AS count FROM sqlite_master WHERE type = ?')
    .get('table') as { count: number }

  logger.info({ tableCount: row.count }, 'database connected')

  const approveRisky = process.argv.includes('--approve-risky')
  const { input: parsedInput, hasInput } = parseInputArgs(process.argv.slice(2))
  const llmApiKey = process.env.OPENAI_API_KEY
  const llmModel = process.env.OPENAI_MODEL
  const llmBaseUrl = process.env.OPENAI_BASE_URL
  const openaiResponder = llmApiKey
    ? createOpenAIResponder(
        llmModel && llmBaseUrl
          ? { apiKey: llmApiKey, model: llmModel, baseUrl: llmBaseUrl }
          : llmModel
            ? { apiKey: llmApiKey, model: llmModel }
            : llmBaseUrl
              ? { apiKey: llmApiKey, baseUrl: llmBaseUrl }
              : { apiKey: llmApiKey },
      )
    : undefined

  const buildTurnOptions = (): TurnOptions => {
    const base: TurnOptions = { approveRisky }
    if (openaiResponder) {
      return {
        ...base,
        llmResponder: async args => openaiResponder(args.input),
      }
    }
    return base
  }

  if (hasInput) {
    const result = await runTurn(
      parsedInput,
      repository,
      memory,
      permissionRepository,
      undefined,
      buildTurnOptions(),
    )
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
    return
  }

  const sessionId = randomUUID()
  const rl = createInterface({ input, output })
  logger.info(
    { sessionId },
    'interactive mode started (type "exit" or "quit" to leave)',
  )

  while (true) {
    const line = (await rl.question('> ')).trim()
    if (!line) {
      continue
    }
    if (line.toLowerCase() === 'exit' || line.toLowerCase() === 'quit') {
      logger.info({ sessionId }, 'interactive mode stopped')
      break
    }

    const result = await runTurn(
      line,
      repository,
      memory,
      permissionRepository,
      sessionId,
      buildTurnOptions(),
    )
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

  rl.close()
}

main().catch(error => {
  const logger = createLogger()
  logger.error({ error }, 'fatal startup error')
  process.exit(1)
})
