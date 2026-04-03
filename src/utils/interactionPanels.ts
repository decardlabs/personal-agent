import type { TurnEvent } from '../agent/types.js'
import type { FeatureFlag } from '../featureFlags.js'
import type { MemoryDiagnostics } from '../memory/memoryCoordinator.js'
import type { ManagedLLMConfig } from '../llm/modelManagement.js'

export type StatusPanelInput = {
  sessionId: string
  cwd: string
  approveRisky: boolean
  featureFlags: ReadonlySet<FeatureFlag>
  diagnostics: MemoryDiagnostics
  llmConfigSnapshot: ManagedLLMConfig | null
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

export function formatStatusPanel(input: StatusPanelInput): string {
  const featureFlags = [...input.featureFlags]
  const lines = [
    'Status',
    `- session id: ${input.sessionId}`,
    `- cwd: ${input.cwd}`,
    `- permission mode: ${input.approveRisky ? 'auto-approve risky enabled' : 'explicit approval required'}`,
    `- feature flags: ${featureFlags.length > 0 ? featureFlags.join(', ') : '(none)'}`,
  ]

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
  const llmResultEvent = turnEvents.find(event => event.eventType === 'llm_result_received')
  const turnCompletedEvent = turnEvents.find(event => event.eventType === 'turn_completed')
  const turnCancelledEvent = turnEvents.find(event => event.eventType === 'turn_cancelled')

  const inputPayload = asRecord(inputEvent?.payload)
  const reasoningPayload = asRecord(reasoningEvent?.payload)
  const permissionPayload = asRecord((permissionRequiredEvent ?? permissionGrantedEvent)?.payload)
  const modelPayload = asRecord(modelEvent?.payload)
  const toolPayload = asRecord(toolCalledEvent?.payload)
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

  lines.push('')
  lines.push('Result')
  lines.push(`- status: ${explanation.result.status}`)
  lines.push(`- response: ${explanation.result.response ?? explanation.result.outputPreview ?? '(none)'}`)
  if (explanation.result.cancelReason) {
    lines.push(`- cancel reason: ${explanation.result.cancelReason}`)
  }

  return lines.join('\n')
}
