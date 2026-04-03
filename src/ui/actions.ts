import type { UtilityCommandSpec } from '../commands/utilityRegistry.js'
import { createUIStateStore } from './state.js'

type UIStateStore = ReturnType<typeof createUIStateStore>

export function initializeOneshotUI(store: UIStateStore, input: string): void {
  store.setSession('oneshot')
  store.recordInput(input)
  store.setMode('executing_utility')
}

export function initializeInteractiveUI(store: UIStateStore, sessionId: string): void {
  store.setSession(sessionId)
  store.setMode('awaiting_input')
}

export function recordInteractiveInput(store: UIStateStore, input: string): void {
  store.recordInput(input)
}

export function beginUtilityExecution(store: UIStateStore): void {
  store.setMode('executing_utility')
}

export function completeUtilityExecution(
  store: UIStateStore,
  command: UtilityCommandSpec | null,
  input: string,
  output: string,
  nextMode: 'awaiting_input' | 'stopped',
): void {
  store.recordUtilityCommand(command?.id ?? null, input, output)
  store.setMode(nextMode)
}

export function recordCommandAssist(store: UIStateStore, input: string, nextMode: 'awaiting_input' | 'stopped'): void {
  store.pushNotification('warn', `command assist shown for: ${input}`)
  store.setMode(nextMode)
}

export function beginTurnExecution(store: UIStateStore): void {
  store.setMode('executing_turn')
}

export function completeTurnExecution(
  store: UIStateStore,
  input: string,
  turnId: string,
  response: string,
  eventCount: number,
  nextMode: 'awaiting_input' | 'stopped',
  sessionId?: string,
): void {
  if (sessionId) {
    store.setSession(sessionId)
  }
  store.recordTurnResult(input, turnId, response, eventCount)
  store.setMode(nextMode)
}

export function handleExitCommand(store: UIStateStore, command: UtilityCommandSpec, input: string): void {
  store.recordUtilityCommand(command.id, input, 'interactive mode stopped')
  store.setMode('stopped')
}

export function recordUIError(store: UIStateStore, message: string, nextMode?: 'awaiting_input' | 'stopped'): void {
  store.recordError(message)
  if (nextMode) {
    store.setMode(nextMode)
  }
}
