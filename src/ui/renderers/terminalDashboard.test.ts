import { describe, expect, it } from 'vitest'
import { renderTerminalDashboard } from './terminalDashboard.js'

describe('terminalDashboard', () => {
  it('renders a read-only dashboard from ui state and diagnostics', () => {
    const output = renderTerminalDashboard({
      sessionId: 'session-1',
      cwd: '/tmp/project',
      featureFlags: new Set(['ui_tui_mvp', 'verbose_diag']),
      diagnostics: {
        historyTurns: 4,
        preferenceCount: 2,
        persistentFactCount: 6,
        staleFactCount: 1,
        lowConfidenceFactCount: 1,
        averageFactConfidence: 0.82,
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
          responsePreview: 'Search results: src/agent/runTurn.ts',
          eventCount: 6,
        },
        lastError: null,
        notificationCount: 2,
        notifications: [
          { level: 'success', message: 'Status ready', createdAt: '2026-04-03T00:00:01.000Z' },
        ],
      },
    })

    expect(output).toContain('Personal Assistant TUI MVP')
    expect(output).toContain('ui mode')
    expect(output).toContain('awaiting_input')
    expect(output).toContain('feature flags')
    expect(output).toContain('ui_tui_mvp, verbose_diag')
    expect(output).toContain('gpt-4o-mini via preference')
  })
})
