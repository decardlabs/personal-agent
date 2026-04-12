import { describe, expect, it } from 'vitest'
import type { TurnEvent } from '../agent/types.js'
import {
  buildLatestTurnSummary,
  buildTurnExplanation,
  formatDreamMetricsPanel,
  formatStatusPanel,
  formatTurnExplanation,
} from './interactionPanels.js'

function createEvent(eventType: TurnEvent['eventType'], payload: Record<string, unknown>): TurnEvent {
  return {
    sessionId: 'session-1',
    turnId: 'turn-1',
    eventType,
    payload,
    createdAt: '2026-04-03T00:00:00.000Z',
  }
}

describe('interactionPanels', () => {
  it('formats status panel with llm and feature flags', () => {
    const output = formatStatusPanel({
      sessionId: 'session-1',
      cwd: '/tmp/project',
      approveRisky: true,
      featureFlags: new Set(['verbose_diag']),
      diagnostics: {
        historyTurns: 3,
        preferenceCount: 2,
        persistentFactCount: 4,
        staleFactCount: 1,
        lowConfidenceFactCount: 1,
        averageFactConfidence: 0.85,
        recommendedAction: 'review',
        writeDecisionsTotal: 10,
        writeDecisionsAllowed: 8,
        writeDecisionsRejected: 2,
        writeDecisionAcceptanceRate: 0.8,
        lastMemoryDreamAt: '2026-04-12T11:40:00.000Z',
        lastMemoryDreamWriteCount: 2,
        lastMemoryDreamStatus: 'completed',
        lastMemoryDreamReason: 'triggered',
        lastMemoryDreamReasonCode: 'TRIGGERED',
      },
      taskSummary: {
        totalTasks: 4,
        activeTasks: 1,
        failedTasks: 1,
        latestTaskId: 'task-42',
        latestCheckpointAt: '2026-04-03T00:00:02.000Z',
      },
      uiState: {
        mode: 'awaiting_input',
        sessionId: 'session-1',
        lastInput: '/status',
        lastCommand: {
          kind: 'utility',
          input: '/status',
          commandId: 'status',
          createdAt: '2026-04-03T00:00:00.000Z',
        },
        lastTurn: {
          turnId: 'turn-1',
          responsePreview: 'LLM says: project is healthy',
          eventCount: 6,
        },
        lastError: null,
        notificationCount: 2,
        notifications: [
          {
            level: 'success',
            message: 'Status ready',
            createdAt: '2026-04-03T00:00:01.000Z',
          },
        ],
      },
      llmConfigSnapshot: {
        model: 'gpt-4o-mini',
        source: 'preference',
        fallbackModel: null,
        timeoutMs: 20000,
        maxRetries: 1,
        temperature: 0.2,
        maxOutputTokens: null,
        decisionLog: ['model: user preference'],
      },
    })

    expect(output).toContain('Status')
    expect(output).toContain('ui mode: awaiting_input')
    expect(output).toContain('permission mode: auto-approve risky enabled')
    expect(output).toContain('last command id: status')
    expect(output).toContain('latest notification: Status ready')
    expect(output).toContain('feature flags: verbose_diag')
    expect(output).toContain('llm: enabled (gpt-4o-mini via preference)')
    expect(output).toContain('memory action: review')
    expect(output).toContain('memory dream status: completed')
    expect(output).toContain('memory dream reason code: TRIGGERED')
    expect(output).toContain('memory dream reason: triggered')
    expect(output).toContain('memory dream guidance: healthy: dream executed successfully')
    expect(output).toContain('tasks: 4 total (1 active, 1 failed)')
    expect(output).toContain('latest task: task-42')
    expect(output).toContain('latest turn events: 6')
    expect(output).toContain('latest response: LLM says: project is healthy')
  })

  it('builds and formats turn explanation by stages', () => {
    const explanation = buildTurnExplanation([
      createEvent('input_normalized', { input: 'what is the project status', normalizedInput: 'what is the project status' }),
      createEvent('reasoning_started', {
        historyTurns: 2,
        persistentFacts: 3,
        rememberedLastEcho: 'hello',
        context: { preferences: [{ key: 'llm_model', value: 'gpt-4o-mini' }] },
      }),
      createEvent('llm_model_resolved', {
        model: 'gpt-4o-mini',
        source: 'preference',
        fallbackModel: null,
        decisionLog: ['model: user preference'],
      }),
      createEvent('llm_called', { input: 'what is the project status' }),
      createEvent('llm_result_received', { outputPreview: 'LLM says: project is healthy' }),
      createEvent('turn_completed', { response: 'LLM says: project is healthy' }),
    ])

    expect(explanation).not.toBeNull()
    expect(explanation?.model.used).toBe(true)
    expect(explanation?.memory.preferenceItemsUsed).toBe(1)
    expect(explanation?.result.status).toBe('completed')

    const output = formatTurnExplanation(explanation!)
    expect(output).toContain('Input')
    expect(output).toContain('Memory')
    expect(output).toContain('Permission')
    expect(output).toContain('Model')
    expect(output).toContain('Tooling')
    expect(output).toContain('Result')
    expect(output).toContain('response: LLM says: project is healthy')
  })

  it('captures permission-required and tool outcome details', () => {
    const explanation = buildTurnExplanation([
      createEvent('input_normalized', { input: 'echo hi && sudo ls', normalizedInput: 'echo hi && sudo ls' }),
      createEvent('reasoning_started', { historyTurns: 0, persistentFacts: 0, context: { preferences: [] } }),
      createEvent('permission_required', { toolName: 'echo', permissionKey: 'echo:sudo', reason: 'risky_input' }),
      createEvent('turn_completed', { response: 'Permission required for risky input. Re-run with explicit approval.' }),
    ])

    expect(explanation?.permission.status).toBe('required')
    expect(explanation?.permission.reason).toBe('risky_input')
    expect(explanation?.tool.outcome).toBe('not_used')
  })

  it('captures tool request, output preview, retries, and latest turn summary', () => {
    const turnEvents = [
      createEvent('input_normalized', { input: 'search runTurn', normalizedInput: 'search runTurn' }),
      createEvent('reasoning_started', { historyTurns: 1, persistentFacts: 2, context: { preferences: [] } }),
      createEvent('tool_called', { toolName: 'search', query: 'runTurn' }),
      createEvent('tool_retry', { toolName: 'search', attempt: 1, error: 'transient error' }),
      createEvent('tool_result_received', { toolName: 'search', output: 'src/agent/runTurn.ts:1: runTurn' }),
      createEvent('turn_completed', { response: 'Search results:\nsrc/agent/runTurn.ts:1: runTurn' }),
    ]

    const explanation = buildTurnExplanation(turnEvents)
    expect(explanation?.tool.requestSummary).toBe('query=runTurn')
    expect(explanation?.tool.outputPreview).toContain('src/agent/runTurn.ts:1: runTurn')
    expect(explanation?.tool.retryCount).toBe(1)

    const output = formatTurnExplanation(explanation!)
    expect(output).toContain('request: query=runTurn')
    expect(output).toContain('retries: 1')

    const summary = buildLatestTurnSummary(turnEvents)
    expect(summary?.eventCount).toBe(6)
    expect(summary?.toolName).toBe('search')
    expect(summary?.usedLLM).toBe(false)
  })

  it('formats memory dream metrics panel with sorted reason counts', () => {
    const output = formatDreamMetricsPanel({
      limit: 1000,
      windowLabel: 'all-time',
      sampledCount: 10,
      totalAttempts: 10,
      completed: 4,
      skipped: 6,
      completionRate: 0.4,
      skipRate: 0.6,
      averageWritesPerAttempt: 1.2,
      reasonCodeHistogram: {
        COOLDOWN: 4,
        TRIGGERED: 4,
        LOCKED: 2,
      },
    })

    expect(output).toContain('Memory Dream Metrics')
    expect(output).toContain('window: all-time')
    expect(output).toContain('limit: 1000')
    expect(output).toContain('sampled: 10')
    expect(output).toContain('attempts: 10')
    expect(output).toContain('completion rate: 40.0%')
    expect(output).toContain('avg writes/attempt: 1.20')
    expect(output).toContain('TRIGGERED: 4')
    expect(output).toContain('COOLDOWN: 4')
    expect(output).toContain('LOCKED: 2')
  })
})
