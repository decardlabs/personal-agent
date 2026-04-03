import { describe, expect, it } from 'vitest'
import { createUIStateStore } from './state.js'

describe('ui state store', () => {
  it('tracks mode, session, and input', () => {
    const store = createUIStateStore({ mode: 'booting' })

    store.setMode('interactive')
    store.setSession('session-1')
    store.recordInput('/status')

    const state = store.getState()
    expect(state.mode).toBe('interactive')
    expect(state.sessionId).toBe('session-1')
    expect(state.lastInput).toBe('/status')
  })

  it('records utility commands and notifications', () => {
    const store = createUIStateStore()

    store.recordUtilityCommand('status', '/status', 'Status\n- llm: disabled')

    const state = store.getState()
    expect(state.lastCommand?.kind).toBe('utility')
    expect(state.lastCommand?.commandId).toBe('status')
    expect(state.notificationCount).toBe(2)
    expect(state.notifications.at(-1)?.message).toContain('Status')
  })

  it('records turn results and errors', () => {
    const store = createUIStateStore()

    store.recordTurnResult('search runTurn', 'turn-1', 'Search results:\nsrc/agent/runTurn.ts', 5)
    store.recordError('network unavailable')

    const state = store.getState()
    expect(state.lastCommand?.kind).toBe('turn')
    expect(state.lastTurn?.turnId).toBe('turn-1')
    expect(state.lastTurn?.eventCount).toBe(5)
    expect(state.lastError).toBe('network unavailable')
  })

  it('limits notifications and can clear them', () => {
    const store = createUIStateStore()
    for (let idx = 0; idx < 25; idx++) {
      store.pushNotification('info', `msg-${idx}`)
    }
    expect(store.getState().notificationCount).toBe(20)

    store.clearNotifications()
    expect(store.getState().notificationCount).toBe(0)
  })
})
