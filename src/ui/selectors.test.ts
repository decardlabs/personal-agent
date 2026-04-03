import { describe, expect, it } from 'vitest'
import {
  getLastCommandSummary,
  getLastTurnSummary,
  getLatestNotificationSummary,
  getUIStatusSummary,
} from './selectors.js'
import type { UIStateSnapshot } from './state.js'

function createState(overrides: Partial<UIStateSnapshot> = {}): UIStateSnapshot {
  return {
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
      responsePreview: 'Search results: ...',
      eventCount: 6,
    },
    lastError: null,
    notificationCount: 2,
    notifications: [
      { level: 'info', message: 'utility command handled: status', createdAt: '2026-04-03T00:00:00.000Z' },
      { level: 'success', message: 'Status ready', createdAt: '2026-04-03T00:00:01.000Z' },
    ],
    ...overrides,
  }
}

describe('ui selectors', () => {
  it('returns latest notification summary', () => {
    const summary = getLatestNotificationSummary(createState())
    expect(summary.latestLevel).toBe('success')
    expect(summary.latestMessage).toBe('Status ready')
    expect(summary.count).toBe(2)
  })

  it('returns last command and last turn summaries', () => {
    const state = createState()
    expect(getLastCommandSummary(state)?.commandId).toBe('status')
    expect(getLastTurnSummary(state)?.turnId).toBe('turn-1')
  })

  it('returns null summaries when state has no command or turn', () => {
    const state = createState({ lastCommand: null, lastTurn: null, notifications: [], notificationCount: 0 })
    expect(getLastCommandSummary(state)).toBeNull()
    expect(getLastTurnSummary(state)).toBeNull()
    expect(getLatestNotificationSummary(state).latestMessage).toBeNull()
  })

  it('builds a compact UI status summary', () => {
    const summary = getUIStatusSummary(createState())
    expect(summary.mode).toBe('awaiting_input')
    expect(summary.lastCommand?.kind).toBe('utility')
    expect(summary.lastTurn?.eventCount).toBe(6)
    expect(summary.notifications.latestLevel).toBe('success')
  })
})
