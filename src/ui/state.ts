export type UIMode =
  | 'booting'
  | 'oneshot'
  | 'interactive'
  | 'awaiting_input'
  | 'executing_utility'
  | 'executing_turn'
  | 'stopped'

export type UINotification = {
  level: 'info' | 'success' | 'warn' | 'error'
  message: string
  createdAt: string
}

export type UILastCommand = {
  kind: 'utility' | 'turn'
  input: string
  commandId: string | null
  createdAt: string
}

export type UILastTurnState = {
  turnId: string
  responsePreview: string
  eventCount: number
}

export type UIStateSnapshot = {
  mode: UIMode
  sessionId: string | null
  lastInput: string | null
  lastCommand: UILastCommand | null
  lastTurn: UILastTurnState | null
  lastError: string | null
  notificationCount: number
  notifications: UINotification[]
}

type UIState = UIStateSnapshot

function nowIso(): string {
  return new Date().toISOString()
}

function preview(text: string, maxLength = 120): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`
}

export function createUIStateStore(initial?: Partial<UIState>) {
  let state: UIState = {
    mode: initial?.mode ?? 'booting',
    sessionId: initial?.sessionId ?? null,
    lastInput: initial?.lastInput ?? null,
    lastCommand: initial?.lastCommand ?? null,
    lastTurn: initial?.lastTurn ?? null,
    lastError: initial?.lastError ?? null,
    notificationCount: initial?.notificationCount ?? 0,
    notifications: initial?.notifications ?? [],
  }

  const pushNotification = (level: UINotification['level'], message: string): void => {
    const notification: UINotification = {
      level,
      message,
      createdAt: nowIso(),
    }
    const notifications = [...state.notifications, notification].slice(-20)
    state = {
      ...state,
      notifications,
      notificationCount: notifications.length,
    }
  }

  return {
    getState(): UIStateSnapshot {
      return {
        ...state,
        notifications: [...state.notifications],
      }
    },

    setMode(mode: UIMode): void {
      state = {
        ...state,
        mode,
      }
    },

    setSession(sessionId: string | null): void {
      state = {
        ...state,
        sessionId,
      }
    },

    recordInput(input: string): void {
      state = {
        ...state,
        lastInput: input,
      }
    },

    recordUtilityCommand(commandId: string | null, input: string, output: string): void {
      state = {
        ...state,
        lastInput: input,
        lastCommand: {
          kind: 'utility',
          input,
          commandId,
          createdAt: nowIso(),
        },
        lastError: null,
      }
      pushNotification('info', `utility command handled: ${commandId ?? input}`)
      pushNotification('success', preview(output))
    },

    recordTurnResult(input: string, turnId: string, response: string, eventCount: number): void {
      state = {
        ...state,
        lastInput: input,
        lastCommand: {
          kind: 'turn',
          input,
          commandId: null,
          createdAt: nowIso(),
        },
        lastTurn: {
          turnId,
          responsePreview: preview(response),
          eventCount,
        },
        lastError: null,
      }
      pushNotification('success', `turn completed: ${turnId}`)
    },

    recordError(message: string): void {
      state = {
        ...state,
        lastError: message,
      }
      pushNotification('error', message)
    },

    pushNotification,

    clearNotifications(): void {
      state = {
        ...state,
        notifications: [],
        notificationCount: 0,
      }
    },
  }
}
