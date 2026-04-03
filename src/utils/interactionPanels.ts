import type { TurnEvent } from '../agent/types.js'
import type { FeatureFlag } from '../featureFlags.js'
import type { MemoryDiagnostics } from '../memory/memoryCoordinator.js'
import type { ManagedLLMConfig } from '../llm/modelManagement.js'
import type { UIStateSnapshot } from '../ui/state.js'

export type StatusPanelInput = {
  sessionId: string
  cwd: string
  approveRisky: boolean
  featureFlags: ReadonlySet<FeatureFlag>
  diagnostics: MemoryDiagnostics
  llmConfigSnapshot: ManagedLLMConfig | null
  uiState: UIStateSnapshot
  latestTurnSummary: {
    turnId: string
    eventCount: number
    outcome: 'completed' | 'cancelled' | 'incomplete'
    toolName: string | null
    usedLLM: boolean
    responsePreview: string | null
  } | null
}

export type TurnExplanation = {
  turnId: string
  input: {
    rawInput: string | null
    normalizedInput: string | null
  }
  memory: {
    historyTurnsUsed: number
    preferenceItemsUsed: number
    persistentFactsConsidered: number
    rememberedLastEcho: string | null
  }
  permission: {
    status: 'not_required' | 'required' | 'granted'
    toolName: string | null
    permissionKey: string | null
    reason: string | null
  }
  model: {
    used: boolean
    model: string | null
    source: string | null
    fallbackModel: string | null
    decisionLog: string[]
  }
  tool: {
    called: boolean
    toolName: string | null
    outcome: 'not_used' | 'success' | 'error' | 'timeout'
    requestSummary: string | null
    outputPreview: string | null
    retryCount: number
  }
  result: {
    status: 'completed' | 'cancelled' | 'incomplete'
    response: string | null
    outputPreview: string | null
    cancelReason: string | null
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function summarizeToolRequest(payload: Record<string, unknown>): string | null {
  const content = asString(payload.content)
  const query = asString(payload.query)
  const filePath = asString(payload.filePath)

  if (content) {
    return `content=${content}`
  }
  if (query) {
    return `query=${query}`
  }
  if (filePath) {
    return `filePath=${filePath}`
  }
  return null
}

function summarizeOutput(value: unknown): string | null {
  const raw = asString(value)
  if (!raw) {
    return null
  }
  return raw.length <= 120 ? raw : `${raw.slice(0, 117)}...`
}

export function buildLatestTurnSummary(turnEvents: TurnEvent[]): StatusPanelInput['latestTurnSummary'] {
  const explanation = buildTurnExplanation(turnEvents)
  if (!explanation) {
    return null
  }

  return {
    turnId: explanation.turnId,
    eventCount: turnEvents.length,
    outcome: explanation.result.status,
    toolName: explanation.tool.toolName,
    usedLLM: explanation.model.used,
    responsePreview: explanation.result.response ?? explanation.result.outputPreview,
  }
}

export function formatStatusPanel(input: StatusPanelInput): string {
  const featureFlags = [...input.featureFlags]
  const lines = [
    'Status',
    `- session id: ${input.sessionId}`,
    `- cwd: ${input.cwd}`,
    `- ui mode: ${input.uiState.mode}`,
    `- permission mode: ${input.approveRisky ? 'auto-approve risky enabled' : 'explicit approval required'}`,
    `- feature flags: ${featureFlags.length > 0 ? featureFlags.join(', ') : '(none)'}`,
  ]

  lines.push(`- last input: ${input.uiState.lastInput ?? '(none)'}`)
  lines.push(`- notifications: ${input.uiState.notificationCount}`)
  lines.push(`- last error: ${input.uiState.lastError ?? '(none)'}`)
  if (input.uiState.lastCommand) {
    lines.push(`- last command kind: ${input.uiState.lastCommand.kind}`)
    lines.push(`- last command id: ${input.uiState.lastCommand.commandId ?? '(none)'}`)
  }

  if (input.llmConfigSnapshot) {
    lines.push(`- llm: enabled (${input.llmConfigSnapshot.model} via ${input.llmConfigSnapshot.source})`)
    lines.push(`- llm fallback: ${input.llmConfigSnapshot.fallbackModel ?? '(none)'}`)
  } else {
    lines.push('- llm: disabled')
  }

  lines.push(`- history turns: ${input.diagnostics.historyTurns}`)
  lines.push(`- preferences: ${input.diagnostics.preferenceCount}`)
  lines.push(`- persistent facts: ${input.diagnostics.persistentFactCount}`)
  lines.push(`- avg fact confidence: ${input.diagnostics.averageFactConfidence.toFixed(2)}`)
  lines.push(`- memory action: ${input.diagnostics.recommendedAction}`)

  if (input.latestTurnSummary) {
    lines.push(`- latest turn: ${input.latestTurnSummary.turnId}`)
    lines.push(`- latest turn events: ${input.latestTurnSummary.eventCount}`)
    lines.push(`- latest turn outcome: ${input.latestTurnSummary.outcome}`)
    lines.push(`- latest turn tool: ${input.latestTurnSummary.toolName ?? '(none)'}`)
    lines.push(`- latest turn llm: ${input.latestTurnSummary.usedLLM ? 'used' : 'not used'}`)
    lines.push(`- latest response: ${input.latestTurnSummary.responsePreview ?? '(none)'}`)
  }

  return lines.join('\n')
}

export function buildTurnExplanation(turnEvents: TurnEvent[]): TurnExplanation | null {
  if (turnEvents.length === 0) {
    return null
  }

  const turnId = turnEvents[0]?.turnId
  if (!turnId) {
    return null
  }

  const inputEvent = turnEvents.find(event => event.eventType === 'input_normalized')
  const reasoningEvent = turnEvents.find(event => event.eventType === 'reasoning_started')
  const permissionRequiredEvent = turnEvents.find(event => event.eventType === 'permission_required')
  const permissionGrantedEvent = turnEvents.find(event => event.eventType === 'permission_granted')
  const modelEvent = turnEvents.find(event => event.eventType === 'llm_model_resolved')
  const toolCalledEvent = turnEvents.find(event => event.eventType === 'tool_called')
  const toolResultEvent = turnEvents.find(event => event.eventType === 'tool_result_received')
  const toolErrorEvent = turnEvents.find(event => event.eventType === 'tool_error')
  const toolTimeoutEvent = turnEvents.find(event => event.eventType === 'tool_timeout')
  const toolRetryEvents = turnEvents.filter(event => event.eventType === 'tool_retry')
  const llmResultEvent = turnEvents.find(event => event.eventType === 'llm_result_received')
  const turnCompletedEvent = turnEvents.find(event => event.eventType === 'turn_completed')
  const turnCancelledEvent = turnEvents.find(event => event.eventType === 'turn_cancelled')

  const inputPayload = asRecord(inputEvent?.payload)
  const reasoningPayload = asRecord(reasoningEvent?.payload)
  const permissionPayload = asRecord((permissionRequiredEvent ?? permissionGrantedEvent)?.payload)
  const modelPayload = asRecord(modelEvent?.payload)
  const toolPayload = asRecord(toolCalledEvent?.payload)
  const toolResultPayload = asRecord(toolResultEvent?.payload)
  const turnCompletedPayload = asRecord(turnCompletedEvent?.payload)
  const llmResultPayload = asRecord(llmResultEvent?.payload)
  const turnCancelledPayload = asRecord(turnCancelledEvent?.payload)
  const contextPayload = asRecord(reasoningPayload.context)

  const permissionStatus: TurnExplanation['permission']['status'] = permissionRequiredEvent
    ? 'required'
    : permissionGrantedEvent
      ? 'granted'
      : 'not_required'

  const toolOutcome: TurnExplanation['tool']['outcome'] = toolTimeoutEvent
    ? 'timeout'
    : toolErrorEvent
      ? 'error'
      : toolResultEvent
        ? 'success'
        : 'not_used'

  const resultStatus: TurnExplanation['result']['status'] = turnCancelledEvent
    ? 'cancelled'
    : turnCompletedEvent
      ? 'completed'
      : 'incomplete'

  return {
    turnId,
    input: {
      rawInput: asString(inputPayload.input),
      normalizedInput: asString(inputPayload.normalizedInput),
    },
    memory: {
      historyTurnsUsed: asNumber(reasoningPayload.historyTurns),
      preferenceItemsUsed: Array.isArray(contextPayload.preferences) ? contextPayload.preferences.length : 0,
      persistentFactsConsidered: asNumber(reasoningPayload.persistentFacts),
      rememberedLastEcho: asString(reasoningPayload.rememberedLastEcho),
    },
    permission: {
      status: permissionStatus,
      toolName: asString(permissionPayload.toolName),
      permissionKey: asString(permissionPayload.permissionKey),
      reason: asString(permissionPayload.reason),
    },
    model: {
      used: modelEvent !== undefined,
      model: asString(modelPayload.model),
      source: asString(modelPayload.source),
      fallbackModel: asString(modelPayload.fallbackModel),
      decisionLog: asStringArray(modelPayload.decisionLog),
    },
    tool: {
      called: toolCalledEvent !== undefined,
      toolName: asString(toolPayload.toolName),
      outcome: toolOutcome,
      requestSummary: summarizeToolRequest(toolPayload),
      outputPreview: summarizeOutput(toolResultPayload.output),
      retryCount: toolRetryEvents.length,
    },
    result: {
      status: resultStatus,
      response: asString(turnCompletedPayload.response),
      outputPreview: asString(llmResultPayload.outputPreview),
      cancelReason: asString(turnCancelledPayload.reason),
    },
  }
}

export function formatTurnExplanation(explanation: TurnExplanation): string {
  const lines = [
    'Why (latest turn explanation)',
    `- turn id: ${explanation.turnId}`,
    '',
    'Input',
    `- raw input: ${explanation.input.rawInput ?? '(unknown)'}`,
    `- normalized input: ${explanation.input.normalizedInput ?? '(unknown)'}`,
    '',
    'Memory',
    `- history turns used: ${explanation.memory.historyTurnsUsed}`,
    `- preference items used: ${explanation.memory.preferenceItemsUsed}`,
    `- persistent facts considered: ${explanation.memory.persistentFactsConsidered}`,
    `- remembered last echo: ${explanation.memory.rememberedLastEcho ?? '(none)'}`,
    '',
    'Permission',
    `- status: ${explanation.permission.status}`,
    `- tool: ${explanation.permission.toolName ?? '(none)'}`,
    `- reason: ${explanation.permission.reason ?? '(none)'}`,
  ]

  lines.push('')
  lines.push('Model')
  if (explanation.model.used) {
    lines.push(`- model: ${explanation.model.model ?? '(unknown)'}`)
    lines.push(`- source: ${explanation.model.source ?? '(unknown)'}`)
    lines.push(`- fallback: ${explanation.model.fallbackModel ?? '(none)'}`)
    lines.push(`- decision log: ${explanation.model.decisionLog.join(' | ') || '(none)'}`)
  } else {
    lines.push('- model: not used')
  }

  lines.push('')
  lines.push('Tooling')
  lines.push(`- called: ${explanation.tool.called ? 'yes' : 'no'}`)
  lines.push(`- tool: ${explanation.tool.toolName ?? '(none)'}`)
  lines.push(`- outcome: ${explanation.tool.outcome}`)
  lines.push(`- request: ${explanation.tool.requestSummary ?? '(none)'}`)
  lines.push(`- output preview: ${explanation.tool.outputPreview ?? '(none)'}`)
  lines.push(`- retries: ${explanation.tool.retryCount}`)

  lines.push('')
  lines.push('Result')
  lines.push(`- status: ${explanation.result.status}`)
  lines.push(`- response: ${explanation.result.response ?? explanation.result.outputPreview ?? '(none)'}`)
  if (explanation.result.cancelReason) {
    lines.push(`- cancel reason: ${explanation.result.cancelReason}`)
  }

  return lines.join('\n')
}
