import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { createLogger } from './observability/logger.js'
import { initializeDatabase } from './storage/db.js'
import { SessionEventRepository } from './storage/sessionEventRepository.js'
import { runTurn } from './agent/runTurn.js'
import { applyMigrations } from './storage/migrate.js'
import { MemoryFactRepository } from './storage/memoryFactRepository.js'
import { PreferenceRepository } from './storage/preferenceRepository.js'
import { PersistentMemoryStore } from './memory/persistentMemory.js'
import { createMemoryCoordinator } from './memory/memoryCoordinator.js'
import { PreferenceStore } from './memory/preferenceMemory.js'
import { ToolPermissionRepository } from './storage/toolPermissionRepository.js'
import { createOpenAIResponder } from './llm/openaiResponder.js'
import type { TurnOptions } from './agent/runTurn.js'
import { HELP_TEXT, QUICK_HELP } from './utils/help.js'
import { addToHistory, clearHistory, formatHistory, formatHistoryAll } from './utils/commandHistory.js'
import {
  getClosestCommandSuggestion,
  getCompletionSuggestions,
  isKnownCommandInput,
} from './utils/commandAssist.js'
import {
  colorSuccess,
  colorError,
  colorInfo,
  colorWarn,
  colorCommand,
  formatPrompt,
} from './cli/colorOutput.js'

function parseBooleanEnv(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) {
    return defaultValue
  }
  const normalized = value.trim().toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function parseNumberEnv(value: string | undefined, defaultValue: number): number {
  if (value === undefined) {
    return defaultValue
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return defaultValue
  }
  return parsed
}

function parseInputArgs(argv: string[]): { input: string; hasInput: boolean } {
  const filtered = argv.filter(arg => arg !== '--approve-risky')
  const parsedInput = filtered.join(' ').trim()
  return {
    input: parsedInput || 'echo hello world',
    hasInput: parsedInput.length > 0,
  }
}

function formatResponse(response: string): string {
  if (response.includes('Permission required')) {
    return colorError(response)
  }
  if (response.startsWith('Echo:')) {
    return colorSuccess(response)
  }
  if (response.startsWith('Search results:')) {
    return colorCommand('Search results:') + response.slice(15)
  }
  if (response.startsWith('File:')) {
    return colorCommand('File:') + response.slice(5)
  }
  if (response.startsWith('Preference')) {
    return colorInfo(response)
  }
  return response
}

function executeUtilityCommand(
  command: string,
  sessionId: string,
  repository: SessionEventRepository,
  memory: ReturnType<typeof createMemoryCoordinator>,
): string | null {
  const normalized = command.trim().toLowerCase()

  if (normalized === '/help') {
    return HELP_TEXT
  }
  if (normalized === '/history') {
    return `${colorCommand('Command History (session-first, deduped):')}\n${formatHistory(sessionId, process.cwd())}`
  }
  if (normalized === '/history --all') {
    return `${colorCommand('Command History (project recent 50):')}\n${formatHistoryAll(process.cwd())}`
  }
  if (normalized === '/clear-history') {
    clearHistory()
    return colorSuccess('Command history cleared.')
  }
  if (normalized === '/memory' || normalized === '/memory --detailed') {
    const bundle = memory.retrieveForLLM(sessionId)
    const base = [
      colorCommand('Memory Snapshot'),
      `- preferences: ${bundle.preferences.length}`,
      `- history turns: ${bundle.history.length}`,
      `- persistent facts: ${bundle.persistentFacts.length}`,
      `- context cwd: ${bundle.context.cwd}`,
    ]

    if (normalized === '/memory --detailed') {
      const facts = bundle.persistentFacts
        .slice(0, 5)
        .map((fact, idx) => `  ${idx + 1}. ${fact.key}=${fact.value} (conf=${fact.confidence.toFixed(2)})`)

      base.push('- top persistent facts:')
      base.push(facts.length > 0 ? facts.join('\n') : '  (none)')
    }

    return base.join('\n')
  }
  if (normalized === '/diag') {
    const diagnostics = memory.getDiagnostics(sessionId)
    return [
      colorCommand('Diagnostics'),
      `- history turns: ${diagnostics.historyTurns}`,
      `- preference count: ${diagnostics.preferenceCount}`,
      `- persistent fact count: ${diagnostics.persistentFactCount}`,
      `- stale fact count: ${diagnostics.staleFactCount}`,
      `- low-confidence fact count: ${diagnostics.lowConfidenceFactCount}`,
      `- average fact confidence: ${diagnostics.averageFactConfidence.toFixed(2)}`,
      `- recommended action: ${diagnostics.recommendedAction}`,
    ].join('\n')
  }
  if (normalized === '/diag --json') {
    const diagnostics = memory.getDiagnostics(sessionId)
    return JSON.stringify(
      {
        sessionId,
        generatedAt: new Date().toISOString(),
        diagnostics,
      },
      null,
      2,
    )
  }
  if (normalized === '/why' || normalized === '/why --json') {
    const events = repository.listBySession(sessionId, 300)
    const latestCompleted = events.find(event => event.eventType === 'turn_completed')
    if (!latestCompleted) {
      return colorInfo('No previous turn in this session. Run one command first, then use /why.')
    }

    const latestTurnId = latestCompleted.turnId
    const reasoning = events.find(
      event => event.turnId === latestTurnId && event.eventType === 'reasoning_started',
    )

    if (!reasoning) {
      return colorInfo('No reasoning trace found for the latest turn.')
    }

    const payload = reasoning.payload as Record<string, unknown>
    const historyTurns = typeof payload.historyTurns === 'number' ? payload.historyTurns : 0
    const persistentFacts = typeof payload.persistentFacts === 'number' ? payload.persistentFacts : 0
    const rememberedLastEcho =
      typeof payload.rememberedLastEcho === 'string' && payload.rememberedLastEcho.length > 0
        ? payload.rememberedLastEcho
        : '(none)'
    const context = payload.context as Record<string, unknown> | undefined
    const prefCount = Array.isArray(context?.preferences) ? context.preferences.length : 0

    if (normalized === '/why --json') {
      return JSON.stringify(
        {
          turnId: latestTurnId,
          historyTurnsUsed: historyTurns,
          preferenceItemsUsed: prefCount,
          persistentFactsConsidered: persistentFacts,
          rememberedLastEcho,
        },
        null,
        2,
      )
    }

    return [
      colorCommand('Why (latest turn memory usage)'),
      `- turn id: ${latestTurnId}`,
      `- history turns used: ${historyTurns}`,
      `- preference items used: ${prefCount}`,
      `- persistent facts considered: ${persistentFacts}`,
      `- remembered last echo: ${rememberedLastEcho}`,
    ].join('\n')
  }
  if (normalized === '/consolidate-memory') {
    const result = memory.persistent.consolidate()
    return colorSuccess(`Memory consolidation complete. Removed ${result.removedCount} stale low-confidence facts.`)
  }
  if (normalized === '/consolidate-memory --auto') {
    const diagnostics = memory.getDiagnostics(sessionId)
    if (diagnostics.recommendedAction !== 'consolidate') {
      return colorInfo('Memory is healthy enough. Auto-consolidation skipped.')
    }

    const result = memory.persistent.consolidate()
    return colorSuccess(`Auto-consolidation complete. Removed ${result.removedCount} stale low-confidence facts.`)
  }
  return null
}

function maybePrintCommandAssist(inputLine: string): boolean {
  const normalized = inputLine.trim().toLowerCase()
  if (!normalized || isKnownCommandInput(normalized)) {
    return false
  }

  const completions = getCompletionSuggestions(normalized)
  if (completions.length > 0) {
    console.log(colorWarn(`Command looks incomplete. Possible completions: ${completions.join(', ')}`))
    return true
  }

  const suggestion = getClosestCommandSuggestion(normalized)
  if (suggestion) {
    console.log(colorWarn(`Unknown command. Did you mean: ${suggestion}`))
    return true
  }

  return false
}

async function main(): Promise<void> {
  const logger = createLogger()
  const db = initializeDatabase()
  applyMigrations(db)
  const repository = new SessionEventRepository(db)
  const memoryRepository = new MemoryFactRepository(db)
  const preferenceRepository = new PreferenceRepository(db)
  const persistentMemory = new PersistentMemoryStore(memoryRepository)
  const preferenceMemory = new PreferenceStore(preferenceRepository)
  const memory = createMemoryCoordinator(persistentMemory, preferenceMemory)
  const permissionRepository = new ToolPermissionRepository(db)

  logger.info({ state: 'started' }, 'personal-assistant bootstrap complete')

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
    const autoConsolidationConfig = {
      enabled: parseBooleanEnv(process.env.MEMORY_AUTO_CONSOLIDATE_ENABLED, false),
      minTurns: parseNumberEnv(process.env.MEMORY_AUTO_CONSOLIDATE_MIN_TURNS, 20),
      minHoursSinceLastConsolidation: parseNumberEnv(process.env.MEMORY_AUTO_CONSOLIDATE_MIN_HOURS, 24),
      minStaleFacts: parseNumberEnv(process.env.MEMORY_AUTO_CONSOLIDATE_MIN_STALE_FACTS, 3),
      minLowConfidenceFacts: parseNumberEnv(process.env.MEMORY_AUTO_CONSOLIDATE_MIN_LOW_CONF_FACTS, 5),
    }

    const base: TurnOptions = { approveRisky, autoConsolidationConfig }
    if (openaiResponder) {
      return {
        ...base,
        llmResponder: args => openaiResponder(args),
      }
    }
    return base
  }

  if (hasInput) {
    const utilityOutput = executeUtilityCommand(parsedInput, 'oneshot', repository, memory)
    if (utilityOutput !== null) {
      console.log(utilityOutput)
      return
    }

    if (maybePrintCommandAssist(parsedInput)) {
      return
    }

    const result = await runTurn(
      parsedInput,
      repository,
      memory,
      permissionRepository,
      undefined,
      buildTurnOptions(),
    )

    console.log(formatResponse(result.response))

    const events = repository.listByTurn(result.sessionId, result.turnId)
    logger.info(
      {
        sessionId: result.sessionId,
        turnId: result.turnId,
        response: result.response,
        eventCount: events.length,
      },
      'turn executed',
    )
    return
  }

  const sessionId = randomUUID()
  const rl = createInterface({ input, output })
  logger.info(
    { sessionId },
    'interactive mode started'
  )
  console.log(colorInfo(QUICK_HELP))

  while (true) {
    const line = (await rl.question(formatPrompt())).trim()
    if (!line) {
      continue
    }

    const utilityOutput = executeUtilityCommand(line, sessionId, repository, memory)
    if (utilityOutput !== null) {
      console.log(utilityOutput)
      continue
    }

    if (maybePrintCommandAssist(line)) {
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

    // Save to history
    addToHistory(line, { sessionId, projectCwd: process.cwd() })

    console.log(formatResponse(result.response))

    const events = repository.listByTurn(result.sessionId, result.turnId)
    logger.info(
      {
        sessionId: result.sessionId,
        turnId: result.turnId,
        response: result.response,
        eventCount: events.length,
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
