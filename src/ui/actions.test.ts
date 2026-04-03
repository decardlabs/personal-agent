import { describe, expect, it } from 'vitest'
import {
  beginTurnExecution,
  beginUtilityExecution,
  completeTurnExecution,
  completeUtilityExecution,
  handleExitCommand,
  initializeInteractiveUI,
  initializeOneshotUI,
  recordCommandAssist,
  recordInteractiveInput,
  recordUIError,
} from './actions.js'
import { createUIStateStore } from './state.js'

describe('ui actions', () => {
  it('initializes oneshot and interactive flows', () => {
    const oneshot = createUIStateStore()
    initializeOneshotUI(oneshot, '/status')
    expect(oneshot.getState().sessionId).toBe('oneshot')
    expect(oneshot.getState().mode).toBe('executing_utility')

    const interactive = createUIStateStore()
    initializeInteractiveUI(interactive, 'session-1')
    recordInteractiveInput(interactive, 'search runTurn')
    expect(interactive.getState().sessionId).toBe('session-1')
    expect(interactive.getState().mode).toBe('awaiting_input')
    expect(interactive.getState().lastInput).toBe('search runTurn')
  })

  it('records utility completion and command assist', () => {
    const store = createUIStateStore()
    beginUtilityExecution(store)
    completeUtilityExecution(
      store,
      { id: 'status', command: '/status', trigger: '/status', description: 'Show status' },
      '/status',
      'Status',
      'awaiting_input',
    )
    expect(store.getState().lastCommand?.commandId).toBe('status')
    expect(store.getState().mode).toBe('awaiting_input')

    recordCommandAssist(store, 'sear', 'awaiting_input')
    expect(store.getState().notifications.at(-1)?.message).toContain('command assist shown')
  })

  it('records turn completion, exit, and error state', () => {
    const store = createUIStateStore()
    beginTurnExecution(store)
    completeTurnExecution(store, 'echo hi', 'turn-1', 'Echo: hi', 4, 'stopped', 'session-2')
    expect(store.getState().lastTurn?.turnId).toBe('turn-1')
    expect(store.getState().sessionId).toBe('session-2')
    expect(store.getState().mode).toBe('stopped')

    handleExitCommand(store, { id: 'quit', command: 'quit', trigger: 'quit', description: 'Leave interactive mode' }, 'quit')
    expect(store.getState().lastCommand?.commandId).toBe('quit')

    recordUIError(store, 'network unavailable', 'stopped')
    expect(store.getState().lastError).toBe('network unavailable')
  })
})
