import { randomUUID } from 'node:crypto'
import type { SessionEventRepository } from '../storage/sessionEventRepository.js'
import { runEchoTool } from '../tools/echoTool.js'
import { runSearchTool } from '../tools/searchTool.js'
import { runReadFileTool } from '../tools/readFileTool.js'
import { runListDirTool } from '../tools/listDirTool.js'
import { runOpenUrlTool } from '../tools/openUrlTool.js'
import { createStateMachine } from './stateMachine.js'
import type { TurnEvent } from './types.js'
import {
  detectEchoCommand,
  detectSearchCommand,
  detectReadFileCommand,
  detectSetPreferenceCommand,
  detectGetPreferenceCommand,
  detectListDirCommand,
  detectSummarizeCommand,
  detectOpenUrlCommand,
  normalizeInput,
} from './inputNormalizer.js'
import type { MemoryCoordinator, LLMContextBundle } from '../memory/memoryCoordinator.js'
import type { AutoConsolidationConfig } from '../memory/memoryCoordinator.js'
import type { ManagedLLMConfig } from '../llm/modelManagement.js'
import { evaluatePermission } from '../policies/permissionPolicy.js'
import { ToolPermissionRepository } from '../storage/toolPermissionRepository.js'
import type { TaskState } from './taskStateMachine.js'
import { isFeatureEnabled } from '../featureFlags.js'
import { runCoordinatorTurn } from './coordinatorTurn.js'
import type { MemoryDreamConfig } from './memoryDream.js'
import { maybeRunMemoryDream } from './memoryDream.js'
import {
  buildBuiltInToolCalledPayload,
  createBuiltInToolRequest,
  executeBuiltInTool,
  formatBuiltInToolResponse,
  getBuiltInToolMetadata,
} from '../tools/toolCatalog.js'
import { finalizeTurnArtifacts } from './turnFinalizer.js'

export type TurnResult = {
  sessionId: string
  turnId: string
  response: string
}

export type TurnOptions = {
  approveRisky?: boolean
  permissionScope?: string
  taskId?: string
  turnTimeoutMs?: number
  maxToolRetries?: number
  echoToolRunner?: (args: { content: string }) => { output: string }
  searchToolRunner?: (args: { query: string }) => { output: string }
  readFileToolRunner?: (args: { filePath: string }) => { output: string }
  listDirToolRunner?: (args: { dirPath: string }) => { output: string }
  openUrlToolRunner?: (args: { url: string }) => Promise<{ output: string }>
  llmModelConfig?: ManagedLLMConfig
  llmResponder?: (args: {
    input: string
    sessionId: string
    turnId: string
    rememberedLastEcho: string | null
    contextBundle: LLMContextBundle
  }) => Promise<string>
  taskCheckpointWriter?: (checkpoint: {
    taskId: string
    sessionId: string
    turnId: string
    status: TaskState
    stepIndex: number
    payload: Record<string, unknown>
    createdAt: string
  }) => void
  autoConsolidationConfig?: AutoConsolidationConfig
  memoryDreamConfig?: MemoryDreamConfig
  /** Feature flags snapshot — used to enable coordinator_mode and other gates. */
  featureFlags?: ReadonlySet<import('../featureFlags.js').FeatureFlag>
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
  sessionId: string = randomUUID(),
  options: TurnOptions = {},
): Promise<TurnResult> {
  const turnId = randomUUID()
  const turnStartedAt = Date.now()
  const permissionScope = options.permissionScope ?? 'project'
  const sm = createStateMachine()
  const writeTaskCheckpoint = (
    status: TaskState,
    stepIndex: number,
    payload: Record<string, unknown>,
  ): void => {
    if (!options.taskCheckpointWriter || !options.taskId) {
      return
    }

    options.taskCheckpointWriter({
      taskId: options.taskId,
      sessionId,
      turnId,
      status,
      stepIndex,
      payload,
      createdAt: new Date().toISOString(),
    })
  }

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
  const contextBundle = memory.buildLLMContextBundle(sessionId)
  const context = contextBundle.context
  const rememberedLastEcho = memory.persistent.get('last_echo_output')
  repository.save(
    createEvent(sessionId, turnId, 'reasoning_started', {
      normalizedInput,
      context,
      rememberedLastEcho,
      historyTurns: contextBundle.history.length,
      persistentFacts: contextBundle.persistentFacts.length,
    }),
  )

  const echoPayload = detectEchoCommand(normalizedInput)
  const searchPayload = detectSearchCommand(normalizedInput)
  const readFilePayload = detectReadFileCommand(normalizedInput)
  const setPreferencePayload = detectSetPreferenceCommand(normalizedInput)
  const getPreferencePayload = detectGetPreferenceCommand(normalizedInput)
  const listDirPayload = detectListDirCommand(normalizedInput)
  const summarizePayload = detectSummarizeCommand(normalizedInput)
  const openUrlPayload = detectOpenUrlCommand(normalizedInput)
  const toolRequest = createBuiltInToolRequest({
    echoPayload,
    searchPayload,
    readFilePayload,
    listDirPayload,
    openUrlPayload,
  })
  let response = 'I can run echo/search/read/list/summarize/open in this MVP. Try: echo hello, search runTurn, read src/index.ts, list src, summarize README.md, or open https://example.com'

  const resolvedToolName = toolRequest
    ? toolRequest.toolName
    : summarizePayload
      ? 'summarize'
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
    await finalizeTurnArtifacts({
      sessionId,
      turnId,
      normalizedInput,
      finalResponse: response,
      repository,
      memory,
      options,
    })
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
    await finalizeTurnArtifacts({
      sessionId,
      turnId,
      normalizedInput,
      finalResponse: response,
      repository,
      memory,
      options,
    })
    return { sessionId, turnId, response }
  }

  if (
    !echoPayload
    && !searchPayload
    && !readFilePayload
    && !listDirPayload
    && !summarizePayload
    && !openUrlPayload
    && !setPreferencePayload
    && !getPreferencePayload
    && normalizedInput.toLowerCase() !== 'recall last echo'
    && permissionDecision.allowed
    && options.llmResponder
  ) {
    const useCoordinator = isFeatureEnabled('coordinator_mode', options.featureFlags)

    if (useCoordinator) {
      repository.save(
        createEvent(sessionId, turnId, 'llm_called', {
          input: normalizedInput,
          mode: 'coordinator',
        }),
      )
      const coordResult = await runCoordinatorTurn(
        normalizedInput,
        sessionId,
        turnId,
        rememberedLastEcho,
        contextBundle,
        repository,
        memory,
        permissionRepository,
        options,
      )
      response = coordResult.response
      repository.save(
        createEvent(sessionId, turnId, 'llm_result_received', {
          outputPreview: response.slice(0, 120),
          coordinatorPhase: coordResult.phase,
          researchCount: coordResult.findings.length,
        }),
      )
    } else {
      if (options.llmModelConfig) {
        repository.save(
          createEvent(sessionId, turnId, 'llm_model_resolved', {
            model: options.llmModelConfig.model,
            source: options.llmModelConfig.source,
            fallbackModel: options.llmModelConfig.fallbackModel,
            decisionLog: options.llmModelConfig.decisionLog,
          }),
        )
      }
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
          contextBundle,
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
  }

  if (toolRequest && permissionDecision.allowed) {
    const elapsedMs = Date.now() - turnStartedAt
    if (options.turnTimeoutMs !== undefined && elapsedMs >= options.turnTimeoutMs) {
      sm.transitionTo('done')
      writeTaskCheckpoint('timeout', 1, {
        phase: 'before_tool_execution',
        toolName: resolvedToolName,
        normalizedInput,
        elapsedMs,
      })
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
      await finalizeTurnArtifacts({
        sessionId,
        turnId,
        normalizedInput,
        finalResponse: response,
        repository,
        memory,
        options,
      })
      return { sessionId, turnId, response }
    }

    sm.transitionTo('executing_tool')
    writeTaskCheckpoint('running', 1, {
      phase: 'before_tool_execution',
      toolName: resolvedToolName,
      normalizedInput,
    })
    repository.save(
      createEvent(sessionId, turnId, 'tool_called', {
        ...buildBuiltInToolCalledPayload(toolRequest),
      }),
    )

    const maxRetries = options.maxToolRetries ?? getBuiltInToolMetadata(toolRequest.toolName).defaultMaxRetries
    let attempt = 0
    let toolResult!: { output: string }
    try {
      while (true) {
        try {
          toolResult = await executeBuiltInTool(toolRequest, {
            echoToolRunner: options.echoToolRunner,
            searchToolRunner: options.searchToolRunner,
            readFileToolRunner: options.readFileToolRunner,
            listDirToolRunner: options.listDirToolRunner,
            openUrlToolRunner: options.openUrlToolRunner,
          })
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
      writeTaskCheckpoint('failed', 2, {
        phase: 'tool_execution_failed',
        toolName: resolvedToolName,
        normalizedInput,
        error: String(err),
      })
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
      await finalizeTurnArtifacts({
        sessionId,
        turnId,
        normalizedInput,
        finalResponse: response,
        repository,
        memory,
        options,
      })
      return { sessionId, turnId, response }
    }

    if (toolRequest.toolName === 'echo') {
      memory.persistent.set('last_echo_output', toolResult.output, 0.9)
    }
    memory.session.set(sessionId, 'last_response', toolResult.output)
    repository.save(
      createEvent(sessionId, turnId, 'tool_result_received', {
        toolName: resolvedToolName,
        output: toolResult.output,
      }),
    )
    writeTaskCheckpoint('completed', 2, {
      phase: 'after_tool_execution',
      toolName: resolvedToolName,
      normalizedInput,
      outputPreview: toolResult.output.slice(0, 120),
    })

    sm.transitionTo('feeding_back_result')
    response = formatBuiltInToolResponse(toolRequest, toolResult.output)
  }

  // Summarize: two-step Research → Synthesis (inspired by Claude-Code Coordinator pattern)
  // Step 1 (Research): read the file; Step 2 (Synthesis): LLM summarizes it
  if (summarizePayload && permissionDecision.allowed) {
    sm.transitionTo('executing_tool')
    repository.save(
      createEvent(sessionId, turnId, 'tool_called', {
        toolName: 'summarize',
        filePath: summarizePayload,
      }),
    )

    const readResult = (options.readFileToolRunner ?? runReadFileTool)({ filePath: summarizePayload })
    if (readResult.output.startsWith('Error:')) {
      response = readResult.output
    } else if (!options.llmResponder) {
      response = `File content (no LLM configured for summarization):\n${readResult.output}`
    } else {
      repository.save(
        createEvent(sessionId, turnId, 'llm_called', {
          input: `summarize:${summarizePayload}`,
        }),
      )
      try {
        const summaryInput = `Please summarize the following file content concisely:\n\n${readResult.output}`
        const llmResponse = await options.llmResponder({
          input: summaryInput,
          sessionId,
          turnId,
          rememberedLastEcho,
          contextBundle,
        })
        response = `Summary of ${summarizePayload}:\n${llmResponse.trim()}`
        repository.save(
          createEvent(sessionId, turnId, 'llm_result_received', {
            outputPreview: response.slice(0, 120),
          }),
        )
      } catch (err) {
        repository.save(
          createEvent(sessionId, turnId, 'llm_error', { error: String(err) }),
        )
        response = `Failed to summarize ${summarizePayload}: ${String(err)}`
      }
    }

    memory.session.set(sessionId, 'last_response', response)
    sm.transitionTo('feeding_back_result')
  }

  sm.transitionTo('done')
  repository.save(
    createEvent(sessionId, turnId, 'turn_completed', {
      response,
    }),
  )

  await finalizeTurnArtifacts({
    sessionId,
    turnId,
    normalizedInput,
    finalResponse: response,
    repository,
    memory,
    options,
  })

  return {
    sessionId,
    turnId,
    response,
  }
}
