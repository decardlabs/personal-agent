export type AssistantRole = 'system' | 'user' | 'assistant' | 'tool'

export type TurnEventType =
  | 'input_normalized'
  | 'reasoning_started'
  | 'permission_required'
  | 'permission_granted'
  | 'llm_called'
  | 'llm_result_received'
  | 'llm_error'
  | 'tool_called'
  | 'tool_result_received'
  | 'tool_timeout'
  | 'tool_retry'
  | 'tool_error'
  | 'turn_cancelled'
  | 'turn_completed'

export type TurnEvent = {
  sessionId: string
  turnId: string
  eventType: TurnEventType
  payload: Record<string, unknown>
  createdAt: string
}
