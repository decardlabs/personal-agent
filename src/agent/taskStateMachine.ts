export type TaskState =
  | 'pending'
  | 'running'
  | 'paused'
  | 'blocked'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled'

export type TaskStateMachine = {
  getCurrentState: () => TaskState
  canTransitionTo: (next: TaskState) => boolean
  transitionTo: (next: TaskState) => TaskState
}

const ALLOWED_TRANSITIONS: Record<TaskState, TaskState[]> = {
  pending: ['running', 'cancelled'],
  running: ['paused', 'blocked', 'completed', 'failed', 'timeout', 'cancelled'],
  paused: ['running', 'cancelled'],
  blocked: ['running', 'failed', 'cancelled'],
  completed: [],
  failed: [],
  timeout: [],
  cancelled: [],
}

export function createTaskStateMachine(initial: TaskState = 'pending'): TaskStateMachine {
  let current = initial

  return {
    getCurrentState(): TaskState {
      return current
    },
    canTransitionTo(next: TaskState): boolean {
      return ALLOWED_TRANSITIONS[current].includes(next)
    },
    transitionTo(next: TaskState): TaskState {
      if (!ALLOWED_TRANSITIONS[current].includes(next)) {
        throw new Error(`Invalid task state transition: ${current} -> ${next}`)
      }
      current = next
      return current
    },
  }
}
