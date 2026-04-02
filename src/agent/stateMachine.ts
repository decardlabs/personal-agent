export type AgentState =
  | 'idle'
  | 'normalizing_input'
  | 'reasoning'
  | 'awaiting_permission'
  | 'executing_tool'
  | 'feeding_back_result'
  | 'done'

let currentState: AgentState = 'idle'

export function transitionTo(state: AgentState): AgentState {
  currentState = state
  return currentState
}

export function getCurrentState(): AgentState {
  return currentState
}
