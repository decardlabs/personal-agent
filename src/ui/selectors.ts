import type { UIStateSnapshot } from './state.js'

export type UINotificationSummary = {
  latestLevel: UIStateSnapshot['notifications'][number]['level'] | null
  latestMessage: string | null
  count: number
}

export type UILastCommandSummary = {
  kind: 'utility' | 'turn'
  commandId: string | null
  input: string
  createdAt: string
} | null

export type UILastTurnSummary = {
  turnId: string
  responsePreview: string
  eventCount: number
} | null

export type UIStatusSummary = {
  mode: UIStateSnapshot['mode']
  sessionId: string | null
  lastInput: string | null
  lastError: string | null
  notifications: UINotificationSummary
  lastCommand: UILastCommandSummary
  lastTurn: UILastTurnSummary
}

export function getLatestNotificationSummary(state: UIStateSnapshot): UINotificationSummary {
  const latest = state.notifications.at(-1) ?? null
  return {
    latestLevel: latest?.level ?? null,
    latestMessage: latest?.message ?? null,
    count: state.notificationCount,
  }
}

export function getLastCommandSummary(state: UIStateSnapshot): UILastCommandSummary {
  return state.lastCommand
    ? {
      kind: state.lastCommand.kind,
      commandId: state.lastCommand.commandId,
      input: state.lastCommand.input,
      createdAt: state.lastCommand.createdAt,
    }
    : null
}

export function getLastTurnSummary(state: UIStateSnapshot): UILastTurnSummary {
  return state.lastTurn
    ? {
      turnId: state.lastTurn.turnId,
      responsePreview: state.lastTurn.responsePreview,
      eventCount: state.lastTurn.eventCount,
    }
    : null
}

export function getUIStatusSummary(state: UIStateSnapshot): UIStatusSummary {
  return {
    mode: state.mode,
    sessionId: state.sessionId,
    lastInput: state.lastInput,
    lastError: state.lastError,
    notifications: getLatestNotificationSummary(state),
    lastCommand: getLastCommandSummary(state),
    lastTurn: getLastTurnSummary(state),
  }
}
