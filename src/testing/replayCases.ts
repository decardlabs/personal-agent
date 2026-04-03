import type { TurnEventType } from '../agent/types.js'

export type ReplayStep = {
  input: string
  approveRisky?: boolean
  turnTimeoutMs?: number
  mockSearchOutput?: string
  mockReadFileOutput?: string
  memoryIntent?: 'required' | 'not_required' | 'neutral'
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
    steps: [{ input: 'echo hello replay', memoryIntent: 'not_required' }],
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
      { input: 'echo memory-seed', memoryIntent: 'not_required' },
      { input: 'recall last echo', memoryIntent: 'required' },
    ],
    expectedResponses: ['Echo: memory-seed', 'Last echo was: memory-seed'],
  },
  {
    name: 'risky input blocked without approval',
    sessionId: 'replay-session-3',
    steps: [{ input: 'echo hi && sudo ls', memoryIntent: 'not_required' }],
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
      { input: 'echo hi && sudo ls', approveRisky: true, memoryIntent: 'not_required' },
      { input: 'echo hi && sudo ls', memoryIntent: 'not_required' },
    ],
    expectedResponses: ['Echo: hi && sudo ls', 'Echo: hi && sudo ls'],
  },
  {
    name: 'fallback response for unsupported command',
    sessionId: 'replay-session-5',
    steps: [{ input: 'list all files please', memoryIntent: 'not_required' }],
    expectedResponses: ['I can run echo/search/read in this MVP. Try: echo hello, search runTurn, or read src/index.ts'],
  },
  {
    name: 'multi-turn echo sequence',
    sessionId: 'replay-session-6',
    steps: [
      { input: 'echo first-message', memoryIntent: 'not_required' },
      { input: 'echo second-message', memoryIntent: 'not_required' },
    ],
    expectedResponses: ['Echo: first-message', 'Echo: second-message'],
  },
  {
    name: 'recall with no prior echo',
    sessionId: 'replay-session-7',
    steps: [{ input: 'recall last echo', memoryIntent: 'required' }],
    expectedResponses: ['No echo memory yet.'],
  },
  {
    name: 'empty input treated as fallback',
    sessionId: 'replay-session-8',
    steps: [{ input: '', memoryIntent: 'not_required' }],
    expectedResponses: ['I can run echo/search/read in this MVP. Try: echo hello, search runTurn, or read src/index.ts'],
  },
  {
    name: 'whitespace-only input treated as fallback',
    sessionId: 'replay-session-9',
    steps: [{ input: '   ', memoryIntent: 'not_required' }],
    expectedResponses: ['I can run echo/search/read in this MVP. Try: echo hello, search runTurn, or read src/index.ts'],
  },
  {
    name: 'turn cancelled on timeout',
    sessionId: 'replay-session-10',
    steps: [{ input: 'echo hello', turnTimeoutMs: 0, memoryIntent: 'not_required' }],
    expectedResponses: ['Turn cancelled: tool execution timed out.'],
    expectedEventTypes: [[
      'input_normalized',
      'reasoning_started',
      'tool_timeout',
      'turn_cancelled',
    ]],
  },
  {
    name: 'search with mocked deterministic output',
    sessionId: 'replay-session-11',
    steps: [{ input: 'search runTurn', mockSearchOutput: 'src/agent/runTurn.ts:1: runTurn', memoryIntent: 'not_required' }],
    expectedResponses: ['Search results:\nsrc/agent/runTurn.ts:1: runTurn'],
    expectedEventTypes: [[
      'input_normalized',
      'reasoning_started',
      'tool_called',
      'tool_result_received',
      'turn_completed',
    ]],
  },
  {
    name: 'read-file with mocked output',
    sessionId: 'replay-session-12',
    steps: [{ input: 'read src/index.ts', mockReadFileOutput: 'File: src/index.ts (lines 1-5 of 5)\nconsole.log("hello")', memoryIntent: 'not_required' }],
    expectedResponses: ['File:\nFile: src/index.ts (lines 1-5 of 5)\nconsole.log("hello")'],
    expectedEventTypes: [[
      'input_normalized',
      'reasoning_started',
      'tool_called',
      'tool_result_received',
      'turn_completed',
    ]],
  },
]
