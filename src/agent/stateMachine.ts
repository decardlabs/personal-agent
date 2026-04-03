export type AgentState =
  | 'idle'
  | 'normalizing_input'
  | 'reasoning'
  | 'awaiting_permission'
  | 'executing_tool'
  | 'feeding_back_result'
  | 'done'

export type StateMachine = {
  transitionTo: (state: AgentState) => AgentState
  getCurrentState: () => AgentState
}

export function createStateMachine(initial: AgentState = 'idle'): StateMachine {
  let currentState: AgentState = initial
  return {
    transitionTo(state: AgentState): AgentState {
      currentState = state
      return currentState
    },
    getCurrentState(): AgentState {
      return currentState
    },
  }
}
