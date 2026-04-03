import { describe, expect, it } from 'vitest'
import type { TurnEvent } from '../agent/types.js'
import {
  buildTurnExplanation,
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
    expect(output).toContain('permission mode: auto-approve risky enabled')
    expect(output).toContain('feature flags: verbose_diag')
    expect(output).toContain('llm: enabled (gpt-4o-mini via preference)')
    expect(output).toContain('memory action: review')
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
})
