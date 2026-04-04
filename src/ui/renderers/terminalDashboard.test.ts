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
        recommendedAction: 'review',        writeDecisionsTotal: 5,
        writeDecisionsAllowed: 5,
        writeDecisionsRejected: 0,
        writeDecisionAcceptanceRate: 1,      },
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
    expect(output).toContain('[SESSION:ACTIVE]')
    expect(output).toContain('[VIEW:STANDARD]')
    expect(output).toContain('[MODEL:ON]')
    expect(output).toContain('[MODEL:ON] +ON')
    expect(output).toContain('[MEMORY:WARN]')
    expect(output).toContain('[MEMORY:WARN] !WARN')
    expect(output).toContain('[Overview]')
    expect(output).toContain('[Runtime]')
    expect(output).toContain('[Memory]')
    expect(output).toContain('[LLM]')
    expect(output.split('\n').some(line => line.includes('[Overview]') && line.includes('[Runtime]'))).toBe(true)
    expect(output.split('\n').some(line => line.includes('[Memory]') && line.includes('[LLM]'))).toBe(true)
    expect(output).toContain('ui mode')
    expect(output).toContain('awaiting_input')
    expect(output).toContain('feature flags')
    expect(output).toContain('ui_tui_mvp, verbose_diag')
    expect(output).toContain('strategy: weight=')
    expect(output).toContain('order=')
    expect(output).toContain('trunc=slot_min_chars_v1')
    expect(output).toContain('strategy_json:')
    expect(output).toContain('"s":"strategy.v1"')
    expect(output).toContain('"w":"base"')
    expect(output).toContain('"o":"priority"')
    expect(output).toContain('"t":"slot_min_chars_v1"')
    expect(output).toContain('gpt-4o-mini via preference')
    expect(output).toContain('stale facts')
    expect(output).toContain('avg confidence')

    const summaryLine = output.split('\n').find(line => line.includes('[MEMORY:WARN]'))
    expect(summaryLine).toBeDefined()
    if (summaryLine) {
      const memoryPos = summaryLine.indexOf('[MEMORY:WARN]')
      const modelPos = summaryLine.indexOf('[MODEL:ON]')
      const sessionPos = summaryLine.indexOf('[SESSION:ACTIVE]')
      const viewPos = summaryLine.indexOf('[VIEW:STANDARD]')
      expect(memoryPos).toBeGreaterThanOrEqual(0)
      expect(modelPos).toBeGreaterThan(memoryPos)
      expect(sessionPos).toBeGreaterThan(modelPos)
      expect(viewPos).toBeGreaterThan(sessionPos)
    }
  })

  it('renders compact and detailed dashboard variants', () => {
    const baseInput = {
      sessionId: 'session-1',
      cwd: '/tmp/project',
      featureFlags: new Set(['ui_tui_mvp']),
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
        mode: 'awaiting_input' as const,
        sessionId: 'session-1',
        lastInput: '/dashboard',
        lastCommand: {
          kind: 'utility' as const,
          input: '/dashboard',
          commandId: 'dashboard',
          createdAt: '2026-04-03T00:00:00.000Z',
        },
        lastTurn: {
          turnId: 'turn-1',
          responsePreview: 'Search results: src/agent/runTurn.ts',
          eventCount: 6,
        },
        lastError: 'none',
        notificationCount: 1,
        notifications: [
          { level: 'info' as const, message: 'Dashboard ready', createdAt: '2026-04-03T00:00:01.000Z' },
        ],
      },
    }

    const compact = renderTerminalDashboard({ ...baseInput, mode: 'compact' })
    const detailed = renderTerminalDashboard({ ...baseInput, mode: 'detailed' })
    const detailedVerbose = renderTerminalDashboard({
      ...baseInput,
      mode: 'detailed',
      featureFlags: new Set(['ui_tui_mvp', 'verbose_diag']),
    })

    expect(compact).toContain('Personal Assistant TUI MVP (compact)')
    expect(compact).toContain('[VIEW:COMPACT]')
    expect(compact).not.toContain('strategy: weight=')
    expect(compact).not.toContain('strategy_json:')
    expect(compact).not.toContain('last cmd time')
    expect(compact).not.toContain('decision log')

    expect(detailed).toContain('Personal Assistant TUI MVP (detailed)')
    expect(detailed).toContain('[VIEW:DETAILED]')
    expect(detailed).toContain('last cmd time')
    expect(detailed).toContain('decision log')
    expect(detailed).toContain('preferences')
    expect(detailedVerbose).toContain('strategy_json:')
    expect(detailedVerbose).toContain('strategy_json_verbose:')
    expect(detailedVerbose).toContain('schema')
    expect(detailedVerbose).toContain('strategy.v1')
    expect(detailedVerbose).toContain('weightProfile')
    expect(detailedVerbose).toContain('"orderingPol')
  })

  it('keeps a stable line count for the same mode when data is sparse', () => {
    const full = renderTerminalDashboard({
      sessionId: 'session-1',
      cwd: '/tmp/project',
      featureFlags: new Set(['ui_tui_mvp']),
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
        lastInput: '/dashboard',
        lastCommand: {
          kind: 'utility',
          input: '/dashboard',
          commandId: 'dashboard',
          createdAt: '2026-04-03T00:00:00.000Z',
        },
        lastTurn: {
          turnId: 'turn-1',
          responsePreview: 'Search results: src/agent/runTurn.ts',
          eventCount: 6,
        },
        lastError: null,
        notificationCount: 1,
        notifications: [
          { level: 'info', message: 'Dashboard ready', createdAt: '2026-04-03T00:00:01.000Z' },
        ],
      },
      mode: 'compact',
    })

    const sparse = renderTerminalDashboard({
      sessionId: null,
      cwd: '/tmp/project',
      featureFlags: new Set(),
      diagnostics: {
        historyTurns: 0,
        preferenceCount: 0,
        persistentFactCount: 0,
        staleFactCount: 0,
        lowConfidenceFactCount: 0,
        averageFactConfidence: 0,
        recommendedAction: 'none',
      },
      llmConfigSnapshot: null,
      uiState: {
        mode: 'awaiting_input',
        sessionId: null,
        lastInput: null,
        lastCommand: null,
        lastTurn: null,
        lastError: null,
        notificationCount: 0,
        notifications: [],
      },
      mode: 'compact',
    })

    expect(full.split('\n')).toHaveLength(sparse.split('\n').length)
  })

  it('pins memory summary first when action is consolidate and marks it as !HOT', () => {
    const output = renderTerminalDashboard({
      sessionId: 'session-critical',
      cwd: '/tmp/project',
      featureFlags: new Set(['ui_tui_mvp']),
      diagnostics: {
        historyTurns: 24,
        preferenceCount: 3,
        persistentFactCount: 20,
        staleFactCount: 9,
        lowConfidenceFactCount: 8,
        averageFactConfidence: 0.42,
        recommendedAction: 'consolidate',
        writeDecisionsTotal: 15,
        writeDecisionsAllowed: 12,
        writeDecisionsRejected: 3,
        writeDecisionAcceptanceRate: 0.8,
      },
      llmConfigSnapshot: {
        model: 'gpt-4o-mini',
        source: 'preference',
        fallbackModel: 'gpt-4.1',
        timeoutMs: 20000,
        maxRetries: 1,
        temperature: 0.2,
        maxOutputTokens: null,
        decisionLog: ['model: user preference'],
      },
      uiState: {
        mode: 'awaiting_input',
        sessionId: 'session-critical',
        lastInput: '/dashboard',
        lastCommand: {
          kind: 'utility',
          input: '/dashboard',
          commandId: 'dashboard',
          createdAt: '2026-04-03T00:00:00.000Z',
        },
        lastTurn: {
          turnId: 'turn-critical',
          responsePreview: 'Consolidation recommended.',
          eventCount: 8,
        },
        lastError: null,
        notificationCount: 1,
        notifications: [
          { level: 'warn', message: 'Memory pressure high', createdAt: '2026-04-03T00:00:02.000Z' },
        ],
      },
      mode: 'standard',
    })

    const summaryLine = output.split('\n').find(line => line.includes('[MEMORY:HOT]'))
    expect(summaryLine).toBeDefined()
    if (summaryLine) {
      expect(summaryLine).toContain('[MEMORY:HOT] !!HOT')
      expect(summaryLine).toContain('[MODEL:FALLBACK]')
      const memoryPos = summaryLine.indexOf('[MEMORY:HOT]')
      const modelPos = summaryLine.indexOf('[MODEL:FALLBACK]')
      const sessionPos = summaryLine.indexOf('[SESSION:ACTIVE]')
      const viewPos = summaryLine.indexOf('[VIEW:STANDARD]')

      expect(memoryPos).toBeGreaterThanOrEqual(0)
      expect(modelPos).toBeGreaterThan(memoryPos)
      if (sessionPos >= 0) {
        expect(memoryPos).toBeLessThan(sessionPos)
      }
      if (viewPos >= 0) {
        expect(memoryPos).toBeLessThan(viewPos)
      }
    }
    expect(output).toContain('fallback')
    expect(output).toContain('gpt-4.1')

    expect(output).toContain('Hint: memory is HOT. Use /dashboard --detailed for deeper diagnostics.')

    const detailedOutput = renderTerminalDashboard({
      sessionId: 'session-critical',
      cwd: '/tmp/project',
      featureFlags: new Set(['ui_tui_mvp']),
      diagnostics: {
        historyTurns: 24,
        preferenceCount: 3,
        persistentFactCount: 20,
        staleFactCount: 9,
        lowConfidenceFactCount: 8,
        averageFactConfidence: 0.42,
        recommendedAction: 'consolidate',
        writeDecisionsTotal: 15,
        writeDecisionsAllowed: 12,
        writeDecisionsRejected: 3,
        writeDecisionAcceptanceRate: 0.8,
      },
      llmConfigSnapshot: {
        model: 'gpt-4o-mini',
        source: 'preference',
        fallbackModel: 'gpt-4.1',
        timeoutMs: 20000,
        maxRetries: 1,
        temperature: 0.2,
        maxOutputTokens: null,
        decisionLog: ['model: user preference'],
      },
      uiState: {
        mode: 'awaiting_input',
        sessionId: 'session-critical',
        lastInput: '/dashboard --detailed',
        lastCommand: {
          kind: 'utility',
          input: '/dashboard --detailed',
          commandId: 'dashboard_detailed',
          createdAt: '2026-04-03T00:00:00.000Z',
        },
        lastTurn: {
          turnId: 'turn-critical',
          responsePreview: 'Consolidation recommended.',
          eventCount: 8,
        },
        lastError: null,
        notificationCount: 1,
        notifications: [
          { level: 'warn', message: 'Memory pressure high', createdAt: '2026-04-03T00:00:02.000Z' },
        ],
      },
      mode: 'detailed',
    })

    expect(detailedOutput).not.toContain('Hint: memory is HOT. Use /dashboard --detailed for deeper diagnostics.')
  })

  it('prioritizes memory/model summary detail over view detail under truncation', () => {
    const output = renderTerminalDashboard({
      sessionId: 'session-with-a-very-long-identifier',
      cwd: '/tmp/project',
      featureFlags: new Set(['ui_tui_mvp']),
      diagnostics: {
        historyTurns: 10,
        preferenceCount: 1,
        persistentFactCount: 4,
        staleFactCount: 1,
        lowConfidenceFactCount: 1,
        averageFactConfidence: 0.75,
        recommendedAction: 'review',
      },
      llmConfigSnapshot: {
        model: 'gpt-4o-mini',
        source: 'environment',
        fallbackModel: null,
        timeoutMs: 20000,
        maxRetries: 1,
        temperature: 0.2,
        maxOutputTokens: null,
        decisionLog: ['model: env variable'],
      },
      uiState: {
        mode: 'awaiting_input',
        sessionId: 'session-with-a-very-long-identifier',
        lastInput: '/dashboard',
        lastCommand: {
          kind: 'utility',
          input: '/dashboard',
          commandId: 'dashboard',
          createdAt: '2026-04-03T00:00:00.000Z',
        },
        lastTurn: null,
        lastError: null,
        notificationCount: 0,
        notifications: [],
      },
      mode: 'standard',
    })

    const summaryLine = output.split('\n').find(line => line.includes('[MEMORY:WARN]'))
    expect(summaryLine).toBeDefined()
    if (summaryLine) {
      const cells = summaryLine.slice(2, -2).split(' | ')
      const memoryCell = cells.find(cell => cell.includes('[MEMORY:WARN]'))
      const modelCell = cells.find(cell => cell.includes('[MODEL:ON]'))
      const viewCell = cells.find(cell => cell.includes('[VIEW:STANDARD]'))

      expect(memoryCell).toBeDefined()
      expect(modelCell).toBeDefined()
      expect(viewCell).toBeDefined()

      if (memoryCell && modelCell && viewCell) {
        expect(memoryCell).toContain('!WARN')
        expect(modelCell).toContain('+ON')
        expect(viewCell).toContain('...')
      }
    }
  })

  it('uses state-driven weights to widen model cell in HOT fallback scenarios', () => {
    const common = {
      sessionId: 'session-with-a-very-long-identifier',
      cwd: '/tmp/project',
      featureFlags: new Set(['ui_tui_mvp']),
      llmConfigSnapshot: {
        model: 'gpt-4o-mini',
        source: 'environment' as const,
        fallbackModel: 'gpt-4.1',
        timeoutMs: 20000,
        maxRetries: 1,
        temperature: 0.2,
        maxOutputTokens: null,
        decisionLog: ['model: env variable'],
      },
      uiState: {
        mode: 'awaiting_input' as const,
        sessionId: 'session-with-a-very-long-identifier',
        lastInput: '/dashboard',
        lastCommand: {
          kind: 'utility' as const,
          input: '/dashboard',
          commandId: 'dashboard',
          createdAt: '2026-04-03T00:00:00.000Z',
        },
        lastTurn: null,
        lastError: null,
        notificationCount: 0,
        notifications: [],
      },
      mode: 'standard' as const,
    }

    const reviewOutput = renderTerminalDashboard({
      ...common,
      diagnostics: {
        historyTurns: 10,
        preferenceCount: 1,
        persistentFactCount: 4,
        staleFactCount: 1,
        lowConfidenceFactCount: 1,
        averageFactConfidence: 0.75,
        recommendedAction: 'review',        writeDecisionsTotal: 8,
        writeDecisionsAllowed: 6,
        writeDecisionsRejected: 2,
        writeDecisionAcceptanceRate: 0.75,      },
    })

    const hotOutput = renderTerminalDashboard({
      ...common,
      diagnostics: {
        historyTurns: 22,
        preferenceCount: 1,
        persistentFactCount: 12,
        staleFactCount: 7,
        lowConfidenceFactCount: 6,
        averageFactConfidence: 0.45,
        recommendedAction: 'consolidate',
        writeDecisionsTotal: 20,
        writeDecisionsAllowed: 14,
        writeDecisionsRejected: 6,
        writeDecisionAcceptanceRate: 0.7,
      },
    })

    const reviewLine = reviewOutput.split('\n').find(line => line.includes('[MODEL:FALLBACK]'))
    const hotLine = hotOutput.split('\n').find(line => line.includes('[MODEL:FALLBACK]'))
    expect(reviewLine).toBeDefined()
    expect(hotLine).toBeDefined()

    if (reviewLine && hotLine) {
      const reviewCell = reviewLine.slice(2, -2).split(' | ').find(cell => cell.includes('[MODEL:FALLBACK]'))
      const hotCell = hotLine.slice(2, -2).split(' | ').find(cell => cell.includes('[MODEL:FALLBACK]'))
      expect(reviewCell).toBeDefined()
      expect(hotCell).toBeDefined()
      if (reviewCell && hotCell) {
        expect(hotCell.length).toBeGreaterThan(reviewCell.length)
      }
    }
  })
})
