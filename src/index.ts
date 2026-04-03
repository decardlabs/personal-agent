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
import {
  applyModelPreferenceMigrations,
  getAllowedModels,
  listModelAliasTable,
  resolveManagedLLMConfig,
  validateAndNormalizePreferredModel,
} from './llm/modelManagement.js'
import { isFeatureEnabled, parseFeatureFlags } from './featureFlags.js'
import type { FeatureFlag } from './featureFlags.js'
import type { TurnOptions } from './agent/runTurn.js'
import { HELP_TEXT, QUICK_HELP } from './utils/help.js'
import { addToHistory, clearHistory, formatHistory, formatHistoryAll } from './utils/commandHistory.js'
import {
  getClosestCommandSuggestion,
  getCompletionSuggestions,
  isKnownCommandInput,
} from './utils/commandAssist.js'
import { findUtilityCommandByInput } from './commands/utilityRegistry.js'
import {
  buildTurnExplanation,
  formatStatusPanel,
  formatTurnExplanation,
} from './utils/interactionPanels.js'
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
  llmConfigSnapshot: ReturnType<typeof resolveManagedLLMConfig> | null,
  approveRisky: boolean,
  flags: ReadonlySet<FeatureFlag> = new Set(),
): string | null {
  const raw = command.trim()
  const normalized = command.trim().toLowerCase()
  const utilityCommand = findUtilityCommandByInput(normalized)

  if (utilityCommand) {
    if (utilityCommand.id === 'exit' || utilityCommand.id === 'quit') {
      return colorInfo('Exit command is only available in interactive mode.')
    }

    if (utilityCommand.id === 'status') {
      const diagnostics = memory.getDiagnostics(sessionId)
      return formatStatusPanel({
        sessionId,
        cwd: process.cwd(),
        approveRisky,
        featureFlags: flags,
        diagnostics,
        llmConfigSnapshot,
      })
    }

    if (utilityCommand.id === 'model') {
      if (!llmConfigSnapshot) {
        return colorInfo('LLM is disabled. Set OPENAI_API_KEY to enable model features.')
      }

      const aliasLines = listModelAliasTable()
        .map(item => `  ${item.alias} -> ${item.model}`)
        .join('\n')

      return [
        colorCommand('LLM Model Configuration'),
        `- active model: ${llmConfigSnapshot.model}`,
        `- source: ${llmConfigSnapshot.source}`,
        `- fallback model: ${llmConfigSnapshot.fallbackModel ?? '(none)'}`,
        `- allowed models policy: ${getAllowedModels(process.env.OPENAI_ALLOWED_MODELS).join(', ')}`,
        `- timeout ms: ${llmConfigSnapshot.timeoutMs}`,
        `- max retries: ${llmConfigSnapshot.maxRetries}`,
        `- temperature: ${llmConfigSnapshot.temperature}`,
        `- max output tokens: ${llmConfigSnapshot.maxOutputTokens ?? '(default)'}`,
        '- aliases:',
        aliasLines,
        '- commands: /model set <alias|model>, /model clear',
      ].join('\n')
    }

    if (utilityCommand.id === 'model_clear') {
      memory.preferences.delete('llm_model')
      return colorSuccess('Model preference cleared. Next turns use environment/default model.')
    }

    if (utilityCommand.id === 'model_set') {
      const value = raw.slice(utilityCommand.trigger.length).trim()
      if (!value) {
        return colorWarn('Usage: /model set <alias|model-name>')
      }

      const validation = process.env.OPENAI_ALLOWED_MODELS === undefined
        ? validateAndNormalizePreferredModel(value)
        : validateAndNormalizePreferredModel(value, {
          envAllowedModels: process.env.OPENAI_ALLOWED_MODELS,
        })
      if (!validation.ok) {
        return colorError([
          `Model preference rejected: ${validation.message}`,
          `Suggestions: ${validation.suggestions.join(', ') || '(none)'}`,
        ].join('\n'))
      }

      memory.preferences.set('llm_model', validation.normalizedModel)
      const note = validation.resolvedFromAlias ? ` (resolved from alias '${value}')` : ''
      return colorSuccess(`Model preference saved: ${validation.normalizedModel}${note}`)
    }

    if (utilityCommand.id === 'help') {
      return HELP_TEXT
    }

    if (utilityCommand.id === 'history') {
      return `${colorCommand('Command History (session-first, deduped):')}\n${formatHistory(sessionId, process.cwd())}`
    }

    if (utilityCommand.id === 'history_all') {
      return `${colorCommand('Command History (project recent 50):')}\n${formatHistoryAll(process.cwd())}`
    }

    if (utilityCommand.id === 'clear_history') {
      clearHistory()
      return colorSuccess('Command history cleared.')
    }

    if (utilityCommand.id === 'memory' || utilityCommand.id === 'memory_detailed') {
      const bundle = memory.retrieveForLLM(sessionId)
      const base = [
        colorCommand('Memory Snapshot'),
        `- preferences: ${bundle.preferences.length}`,
        `- history turns: ${bundle.history.length}`,
        `- persistent facts: ${bundle.persistentFacts.length}`,
        `- context cwd: ${bundle.context.cwd}`,
      ]

      if (utilityCommand.id === 'memory_detailed') {
        const facts = bundle.persistentFacts
          .slice(0, 5)
          .map((fact, idx) => `  ${idx + 1}. ${fact.key}=${fact.value} (conf=${fact.confidence.toFixed(2)})`)

        base.push('- top persistent facts:')
        base.push(facts.length > 0 ? facts.join('\n') : '  (none)')
      }

      return base.join('\n')
    }

    if (utilityCommand.id === 'diag') {
      const diagnostics = memory.getDiagnostics(sessionId)
      const lines = [
        colorCommand('Diagnostics'),
        `- history turns: ${diagnostics.historyTurns}`,
        `- preference count: ${diagnostics.preferenceCount}`,
        `- persistent fact count: ${diagnostics.persistentFactCount}`,
        `- stale fact count: ${diagnostics.staleFactCount}`,
        `- low-confidence fact count: ${diagnostics.lowConfidenceFactCount}`,
        `- average fact confidence: ${diagnostics.averageFactConfidence.toFixed(2)}`,
        `- recommended action: ${diagnostics.recommendedAction}`,
      ]
      if (isFeatureEnabled('verbose_diag', flags)) {
        const rankedFacts = memory.persistent.listRankedFacts().slice(0, 10)
        lines.push('- top ranked facts (verbose_diag):')
        if (rankedFacts.length === 0) {
          lines.push('  (none)')
        } else {
          for (const fact of rankedFacts) {
            lines.push(`  ${fact.key}=${fact.value} (conf=${fact.confidence.toFixed(2)})`)
          }
        }
        if (llmConfigSnapshot) {
          lines.push(`- active model: ${llmConfigSnapshot.model} [${llmConfigSnapshot.source}]`)
          lines.push(`  ${llmConfigSnapshot.decisionLog.join(' | ')}`)
        }
      }
      return lines.join('\n')
    }

    if (utilityCommand.id === 'diag_json') {
      const diagnostics = memory.getDiagnostics(sessionId)
      const payload: Record<string, unknown> = {
        sessionId,
        generatedAt: new Date().toISOString(),
        diagnostics,
      }
      if (isFeatureEnabled('verbose_diag', flags)) {
        payload['rankedFacts'] = memory.persistent.listRankedFacts().slice(0, 10)
        if (llmConfigSnapshot) {
          payload['activeModel'] = {
            model: llmConfigSnapshot.model,
            source: llmConfigSnapshot.source,
            fallbackModel: llmConfigSnapshot.fallbackModel,
            decisionLog: llmConfigSnapshot.decisionLog,
          }
        }
      }
      return JSON.stringify(payload, null, 2)
    }

    if (utilityCommand.id === 'why' || utilityCommand.id === 'why_json') {
      const events = repository.listBySession(sessionId, 300)
      const latestCompleted = events.find(event => event.eventType === 'turn_completed')
      if (!latestCompleted) {
        return colorInfo('No previous turn in this session. Run one command first, then use /why.')
      }

      const latestTurnId = latestCompleted.turnId
      const turnEvents = repository.listByTurn(sessionId, latestTurnId)
      const explanation = buildTurnExplanation(turnEvents)

      if (!explanation) {
        return colorInfo('No reasoning trace found for the latest turn.')
      }

      if (utilityCommand.id === 'why_json') {
        return JSON.stringify(explanation, null, 2)
      }

      return formatTurnExplanation(explanation)
    }

    if (utilityCommand.id === 'consolidate_memory') {
      const result = memory.persistent.consolidate()
      return colorSuccess(`Memory consolidation complete. Removed ${result.removedCount} stale low-confidence facts.`)
    }

    if (utilityCommand.id === 'consolidate_memory_auto') {
      const diagnostics = memory.getDiagnostics(sessionId)
      if (diagnostics.recommendedAction !== 'consolidate') {
        return colorInfo('Memory is healthy enough. Auto-consolidation skipped.')
      }

      const result = memory.persistent.consolidate()
      return colorSuccess(`Auto-consolidation complete. Removed ${result.removedCount} stale low-confidence facts.`)
    }
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

  const modelMigration = applyModelPreferenceMigrations(memory.preferences)
  if (modelMigration.applied) {
    logger.info(
      { migrationId: modelMigration.migrationId, from: modelMigration.previousValue, to: modelMigration.newValue },
      'model preference migrated',
    )
  }

  const featureFlags = parseFeatureFlags(process.env.FEATURE_FLAGS)
  if (featureFlags.size > 0) {
    logger.info({ flags: [...featureFlags] }, 'feature flags enabled')
  }

  logger.info({ state: 'started' }, 'personal-assistant bootstrap complete')

  const row = db
    .prepare('SELECT count(*) AS count FROM sqlite_master WHERE type = ?')
    .get('table') as { count: number }

  logger.info({ tableCount: row.count }, 'database connected')

  const approveRisky = process.argv.includes('--approve-risky')
  const { input: parsedInput, hasInput } = parseInputArgs(process.argv.slice(2))
  const llmApiKey = process.env.OPENAI_API_KEY
  const llmBaseUrl = process.env.OPENAI_BASE_URL

  const buildManagedLLMConfig = () => {
    if (!llmApiKey) {
      return null
    }

    const managedInput: {
      preferenceModel: string | null
      envModel?: string
      envFallbackModel?: string
      envTimeoutMs?: string
      envMaxRetries?: string
      envTemperature?: string
      envMaxOutputTokens?: string
    } = {
      preferenceModel: memory.preferences.get('llm_model'),
    }

    if (process.env.OPENAI_MODEL !== undefined) managedInput.envModel = process.env.OPENAI_MODEL
    if (process.env.OPENAI_FALLBACK_MODEL !== undefined) managedInput.envFallbackModel = process.env.OPENAI_FALLBACK_MODEL
    if (process.env.OPENAI_TIMEOUT_MS !== undefined) managedInput.envTimeoutMs = process.env.OPENAI_TIMEOUT_MS
    if (process.env.OPENAI_MAX_RETRIES !== undefined) managedInput.envMaxRetries = process.env.OPENAI_MAX_RETRIES
    if (process.env.OPENAI_TEMPERATURE !== undefined) managedInput.envTemperature = process.env.OPENAI_TEMPERATURE
    if (process.env.OPENAI_MAX_OUTPUT_TOKENS !== undefined) managedInput.envMaxOutputTokens = process.env.OPENAI_MAX_OUTPUT_TOKENS

    return resolveManagedLLMConfig(managedInput)
  }

  const buildTurnOptions = (): TurnOptions => {
    const autoConsolidationConfig = {
      enabled: parseBooleanEnv(process.env.MEMORY_AUTO_CONSOLIDATE_ENABLED, false),
      minTurns: parseNumberEnv(process.env.MEMORY_AUTO_CONSOLIDATE_MIN_TURNS, 20),
      minHoursSinceLastConsolidation: parseNumberEnv(process.env.MEMORY_AUTO_CONSOLIDATE_MIN_HOURS, 24),
      minStaleFacts: parseNumberEnv(process.env.MEMORY_AUTO_CONSOLIDATE_MIN_STALE_FACTS, 3),
      minLowConfidenceFacts: parseNumberEnv(process.env.MEMORY_AUTO_CONSOLIDATE_MIN_LOW_CONF_FACTS, 5),
    }

    const base: TurnOptions = { approveRisky, autoConsolidationConfig }
    const managed = buildManagedLLMConfig()
    if (managed && llmApiKey) {
      const responderOptions: {
        apiKey: string
        model: string
        fallbackModel?: string
        baseUrl?: string
        timeoutMs: number
        maxRetries: number
        temperature: number
        maxOutputTokens?: number | null
      } = {
        apiKey: llmApiKey,
        model: managed.model,
        timeoutMs: managed.timeoutMs,
        maxRetries: managed.maxRetries,
        temperature: managed.temperature,
      }

      if (managed.fallbackModel) responderOptions.fallbackModel = managed.fallbackModel
      if (llmBaseUrl !== undefined) responderOptions.baseUrl = llmBaseUrl
      if (managed.maxOutputTokens !== null) responderOptions.maxOutputTokens = managed.maxOutputTokens

      const responder = createOpenAIResponder(responderOptions)

      return {
        ...base,
        llmResponder: args => responder(args),
        llmModelConfig: managed,
      }
    }
    return base
  }

  if (hasInput) {
    const utilityOutput = executeUtilityCommand(parsedInput, 'oneshot', repository, memory, buildManagedLLMConfig(), approveRisky, featureFlags)
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

    const matchedCommand = findUtilityCommandByInput(line)
    if (matchedCommand && (matchedCommand.id === 'exit' || matchedCommand.id === 'quit')) {
      logger.info({ sessionId }, 'interactive mode stopped')
      break
    }

    const utilityOutput = executeUtilityCommand(line, sessionId, repository, memory, buildManagedLLMConfig(), approveRisky, featureFlags)
    if (utilityOutput !== null) {
      console.log(utilityOutput)
      continue
    }

    if (maybePrintCommandAssist(line)) {
      continue
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
