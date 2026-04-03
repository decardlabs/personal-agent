import { randomUUID } from 'node:crypto'
import type { SessionEventRepository } from '../storage/sessionEventRepository.js'
import { runEchoTool } from '../tools/echoTool.js'
import { runSearchTool } from '../tools/searchTool.js'
import { runReadFileTool } from '../tools/readFileTool.js'
import { createStateMachine } from './stateMachine.js'
import type { TurnEvent } from './types.js'
import {
  detectEchoCommand,
  detectSearchCommand,
  detectReadFileCommand,
  detectSetPreferenceCommand,
  detectGetPreferenceCommand,
  normalizeInput,
} from './inputNormalizer.js'
import type { MemoryCoordinator } from '../memory/memoryCoordinator.js'
import { evaluatePermission } from '../policies/permissionPolicy.js'
import { ToolPermissionRepository } from '../storage/toolPermissionRepository.js'

export type TurnResult = {
  sessionId: string
  turnId: string
  response: string
}

export type TurnOptions = {
  approveRisky?: boolean
  permissionScope?: string
  turnTimeoutMs?: number
  maxToolRetries?: number
  echoToolRunner?: (args: { content: string }) => { output: string }
  searchToolRunner?: (args: { query: string }) => { output: string }
  readFileToolRunner?: (args: { filePath: string }) => { output: string }
  llmResponder?: (args: {
    input: string
    sessionId: string
    turnId: string
    rememberedLastEcho: string | null
    context: ReturnType<MemoryCoordinator['getContextSnapshot']>
    history: import('../memory/sessionMemory.js').HistoryEntry[]
    persistentFacts: ReturnType<MemoryCoordinator['retrieveForLLM']>['persistentFacts']
  }) => Promise<string>
}

function createEvent(
  sessionId: string,
  turnId: string,
  eventType: TurnEvent['eventType'],
  payload: Record<string, unknown>,
): TurnEvent {
  return {
    sessionId,
    turnId,
    eventType,
    payload,
    createdAt: new Date().toISOString(),
  }
}

export async function runTurn(
  input: string,
  repository: SessionEventRepository,
  memory: MemoryCoordinator,
  permissionRepository: ToolPermissionRepository,
  sessionId = randomUUID(),
  options: TurnOptions = {},
): Promise<TurnResult> {
  const turnId = randomUUID()
  const turnStartedAt = Date.now()
  const permissionScope = options.permissionScope ?? 'project'
  const sm = createStateMachine()

  sm.transitionTo('normalizing_input')
  const normalizedInput = normalizeInput(input)
  memory.session.set(sessionId, 'last_input', normalizedInput)
  repository.save(
    createEvent(sessionId, turnId, 'input_normalized', {
      input,
      normalizedInput,
    }),
  )

  sm.transitionTo('reasoning')
  const memoryBundle = memory.retrieveForLLM(sessionId)
  const context = {
    ...memoryBundle.context,
    preferences: memoryBundle.preferences,
  }
  const rememberedLastEcho = memory.persistent.get('last_echo_output')
  repository.save(
    createEvent(sessionId, turnId, 'reasoning_started', {
      normalizedInput,
      context,
      rememberedLastEcho,
      historyTurns: memoryBundle.history.length,
      persistentFacts: memoryBundle.persistentFacts.length,
    }),
  )

  const echoPayload = detectEchoCommand(normalizedInput)
  const searchPayload = detectSearchCommand(normalizedInput)
  const readFilePayload = detectReadFileCommand(normalizedInput)
  const setPreferencePayload = detectSetPreferenceCommand(normalizedInput)
  const getPreferencePayload = detectGetPreferenceCommand(normalizedInput)
  let response = 'I can run echo/search/read in this MVP. Try: echo hello, search runTurn, or read src/index.ts'

  const resolvedToolName = echoPayload
    ? 'echo'
    : searchPayload
      ? 'search'
      : readFilePayload
        ? 'read-file'
        : setPreferencePayload
          ? 'set-preference'
          : getPreferencePayload
            ? 'get-preference'
            : 'assistant'

  const permissionDecision = evaluatePermission(
    {
      normalizedInput,
      toolName: resolvedToolName,
      scope: permissionScope,
      approveRisky: options.approveRisky ?? false,
    },
    permissionRepository,
  )

  if (!permissionDecision.allowed) {
    sm.transitionTo('awaiting_permission')
    repository.save(
      createEvent(sessionId, turnId, 'permission_required', {
        toolName: resolvedToolName,
        permissionKey: permissionDecision.permissionKey,
        reason: permissionDecision.reason,
      }),
    )
    response = 'Permission required for risky input. Re-run with explicit approval.'
  }

  if (permissionDecision.allowed && permissionDecision.permissionKey) {
    repository.save(
      createEvent(sessionId, turnId, 'permission_granted', {
        toolName: resolvedToolName,
        permissionKey: permissionDecision.permissionKey,
        reason: permissionDecision.reason,
      }),
    )
  }

  if (normalizedInput.toLowerCase() === 'recall last echo') {
    response = rememberedLastEcho
      ? `Last echo was: ${rememberedLastEcho}`
      : 'No echo memory yet.'
  }

  if (setPreferencePayload && permissionDecision.allowed) {
    memory.preferences.set(setPreferencePayload.key, setPreferencePayload.value)
    response = `Preference set: ${setPreferencePayload.key} = ${setPreferencePayload.value}`
    repository.save(
      createEvent(sessionId, turnId, 'turn_completed', { response }),
    )
    sm.transitionTo('done')
    memory.session.pushHistory(sessionId, { input: normalizedInput, response })
    return { sessionId, turnId, response }
  }

  if (getPreferencePayload && permissionDecision.allowed) {
    const prefValue = memory.preferences.get(getPreferencePayload)
    response = prefValue !== null
      ? `Preference ${getPreferencePayload} = ${prefValue}`
      : `Preference '${getPreferencePayload}' not set.`
    repository.save(
      createEvent(sessionId, turnId, 'turn_completed', { response }),
    )
    sm.transitionTo('done')
    memory.session.pushHistory(sessionId, { input: normalizedInput, response })
    return { sessionId, turnId, response }
  }

  if (
    !echoPayload
    && !searchPayload
    && !readFilePayload
    && !setPreferencePayload
    && !getPreferencePayload
    && normalizedInput.toLowerCase() !== 'recall last echo'
    && permissionDecision.allowed
    && options.llmResponder
  ) {
    repository.save(
      createEvent(sessionId, turnId, 'llm_called', {
        input: normalizedInput,
      }),
    )
    try {
      const llmResponse = await options.llmResponder({
        input: normalizedInput,
        sessionId,
        turnId,
        rememberedLastEcho,
        context,
        history: memoryBundle.history,
        persistentFacts: memoryBundle.persistentFacts,
      })
      response = llmResponse.trim() || response
      repository.save(
        createEvent(sessionId, turnId, 'llm_result_received', {
          outputPreview: response.slice(0, 120),
        }),
      )
    } catch (err) {
      repository.save(
        createEvent(sessionId, turnId, 'llm_error', {
          error: String(err),
        }),
      )
    }
  }

  if ((echoPayload || searchPayload || readFilePayload) && permissionDecision.allowed) {
    const elapsedMs = Date.now() - turnStartedAt
    if (options.turnTimeoutMs !== undefined && elapsedMs >= options.turnTimeoutMs) {
      sm.transitionTo('done')
      repository.save(
        createEvent(sessionId, turnId, 'tool_timeout', {
          toolName: resolvedToolName,
          elapsedMs,
        }),
      )
      repository.save(
        createEvent(sessionId, turnId, 'turn_cancelled', { reason: 'timeout' }),
      )
      response = 'Turn cancelled: tool execution timed out.'
      memory.session.pushHistory(sessionId, { input: normalizedInput, response })
      return { sessionId, turnId, response }
    }

    sm.transitionTo('executing_tool')
    repository.save(
      createEvent(sessionId, turnId, 'tool_called', {
        toolName: resolvedToolName,
        content: echoPayload,
        query: searchPayload,
        filePath: readFilePayload,
      }),
    )

    const echoRunner = options.echoToolRunner ?? runEchoTool
    const searchRunner = options.searchToolRunner ?? runSearchTool
    const readFileRunner = options.readFileToolRunner ?? runReadFileTool
    const maxRetries = options.maxToolRetries ?? 0
    let attempt = 0
    let toolResult!: { output: string }
    try {
      while (true) {
        try {
          if (echoPayload) {
            toolResult = echoRunner({ content: echoPayload })
          } else if (searchPayload) {
            toolResult = searchRunner({ query: searchPayload })
          } else if (readFilePayload) {
            toolResult = readFileRunner({ filePath: readFilePayload })
          } else {
            throw new Error('No supported tool payload found')
          }
          break
        } catch (err) {
          if (attempt < maxRetries) {
            attempt++
            repository.save(
              createEvent(sessionId, turnId, 'tool_retry', {
                toolName: resolvedToolName,
                attempt,
                error: String(err),
              }),
            )
          } else {
            throw err
          }
        }
      }
    } catch (err) {
      sm.transitionTo('done')
      repository.save(
        createEvent(sessionId, turnId, 'tool_error', {
          toolName: resolvedToolName,
          error: String(err),
        }),
      )
      repository.save(
        createEvent(sessionId, turnId, 'turn_completed', { response: 'Tool execution failed. Please try again.' }),
      )
      response = 'Tool execution failed. Please try again.'
      memory.session.pushHistory(sessionId, { input: normalizedInput, response })
      return { sessionId, turnId, response }
    }

    if (echoPayload) {
      memory.persistent.set('last_echo_output', toolResult.output, 0.9)
    }
    memory.session.set(sessionId, 'last_response', toolResult.output)
    repository.save(
      createEvent(sessionId, turnId, 'tool_result_received', {
        toolName: resolvedToolName,
        output: toolResult.output,
      }),
    )

    sm.transitionTo('feeding_back_result')
    response = echoPayload
      ? `Echo: ${toolResult.output}`
      : searchPayload
        ? `Search results:\n${toolResult.output}`
        : `File:\n${toolResult.output}`
  }

  sm.transitionTo('done')
  repository.save(
    createEvent(sessionId, turnId, 'turn_completed', {
      response,
    }),
  )

  memory.session.pushHistory(sessionId, { input: normalizedInput, response })

  return {
    sessionId,
    turnId,
    response,
  }
}
