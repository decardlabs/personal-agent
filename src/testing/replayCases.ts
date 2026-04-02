import type { TurnEventType } from '../agent/types.js'

export type ReplayStep = {
  input: string
  approveRisky?: boolean
  turnTimeoutMs?: number
}

export type ReplayCase = {
  name: string
  sessionId: string
  steps: ReplayStep[]
  expectedResponses: string[]
  expectedEventTypes?: TurnEventType[][]
}

export const replayCases: ReplayCase[] = [
  {
    name: 'basic echo flow',
    sessionId: 'replay-session-1',
    steps: [{ input: 'echo hello replay' }],
    expectedResponses: ['Echo: hello replay'],
    expectedEventTypes: [[
      'input_normalized',
      'reasoning_started',
      'tool_called',
      'tool_result_received',
      'turn_completed',
    ]],
  },
  {
    name: 'persistent recall across turns',
    sessionId: 'replay-session-2',
    steps: [
      { input: 'echo memory-seed' },
      { input: 'recall last echo' },
    ],
    expectedResponses: ['Echo: memory-seed', 'Last echo was: memory-seed'],
  },
  {
    name: 'risky input blocked without approval',
    sessionId: 'replay-session-3',
    steps: [{ input: 'echo hi && sudo ls' }],
    expectedResponses: ['Permission required for risky input. Re-run with explicit approval.'],
    expectedEventTypes: [[
      'input_normalized',
      'reasoning_started',
      'permission_required',
      'turn_completed',
    ]],
  },
  {
    name: 'risky input approved and reused',
    sessionId: 'replay-session-4',
    steps: [
      { input: 'echo hi && sudo ls', approveRisky: true },
      { input: 'echo hi && sudo ls' },
    ],
    expectedResponses: ['Echo: hi && sudo ls', 'Echo: hi && sudo ls'],
  },
  {
    name: 'fallback response for unsupported command',
    sessionId: 'replay-session-5',
    steps: [{ input: 'list all files please' }],
    expectedResponses: ['I can run echo only in this MVP. Try: echo hello'],
  },
  {
    name: 'multi-turn echo sequence',
    sessionId: 'replay-session-6',
    steps: [
      { input: 'echo first-message' },
      { input: 'echo second-message' },
    ],
    expectedResponses: ['Echo: first-message', 'Echo: second-message'],
  },
  {
    name: 'recall with no prior echo',
    sessionId: 'replay-session-7',
    steps: [{ input: 'recall last echo' }],
    expectedResponses: ['No echo memory yet.'],
  },
  {
    name: 'empty input treated as fallback',
    sessionId: 'replay-session-8',
    steps: [{ input: '' }],
    expectedResponses: ['I can run echo only in this MVP. Try: echo hello'],
  },
  {
    name: 'whitespace-only input treated as fallback',
    sessionId: 'replay-session-9',
    steps: [{ input: '   ' }],
    expectedResponses: ['I can run echo only in this MVP. Try: echo hello'],
  },
  {
    name: 'turn cancelled on timeout',
    sessionId: 'replay-session-10',
    steps: [{ input: 'echo hello', turnTimeoutMs: 0 }],
    expectedResponses: ['Turn cancelled: tool execution timed out.'],
    expectedEventTypes: [[
      'input_normalized',
      'reasoning_started',
      'tool_timeout',
      'turn_cancelled',
    ]],
  },
]
