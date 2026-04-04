import { describe, expect, it } from 'vitest'
import { initializeDatabase } from '../storage/db.js'
import { applyMigrations } from '../storage/migrate.js'
import { SessionEventRepository } from '../storage/sessionEventRepository.js'
import { runTurn } from './runTurn.js'
import { MemoryFactRepository } from '../storage/memoryFactRepository.js'
import { PreferenceRepository } from '../storage/preferenceRepository.js'
import { PersistentMemoryStore } from '../memory/persistentMemory.js'
import { createMemoryCoordinator } from '../memory/memoryCoordinator.js'
import { PreferenceStore } from '../memory/preferenceMemory.js'
import { ToolPermissionRepository } from '../storage/toolPermissionRepository.js'

function createMemory(db: ReturnType<typeof initializeDatabase>) {
  const memoryRepository = new MemoryFactRepository(db)
  const preferenceRepository = new PreferenceRepository(db)
  return createMemoryCoordinator(
    new PersistentMemoryStore(memoryRepository),
    new PreferenceStore(preferenceRepository),
  )
}

describe('runTurn', () => {
  it('runs echo flow and persists events in order', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)

    const result = await runTurn(
      'echo hello',
      repository,
      memory,
      permissionRepository,
      'session-1',
    )
    const events = repository.listByTurn(result.sessionId, result.turnId)

    expect(result.response).toBe('Echo: hello')
    expect(events.map(event => event.eventType)).toEqual([
      'input_normalized',
      'reasoning_started',
      'tool_called',
      'tool_result_received',
      'turn_completed',
    ])
  })

  it('returns fallback response when no tool command is detected', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)

    const result = await runTurn(
      'what can you do',
      repository,
      memory,
      permissionRepository,
      'session-2',
    )
    const events = repository.listByTurn(result.sessionId, result.turnId)

    expect(result.response).toContain('I can run echo/search/read in this MVP')
    expect(events.map(event => event.eventType)).toEqual([
      'input_normalized',
      'reasoning_started',
      'turn_completed',
    ])
  })

  it('runs search flow and persists search tool events', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)

    const result = await runTurn(
      'search runTurn',
      repository,
      memory,
      permissionRepository,
      'session-search',
      {
        searchToolRunner: args => ({ output: `src/agent/runTurn.ts:1: ${args.query}` }),
      },
    )
    const events = repository.listByTurn(result.sessionId, result.turnId)

    expect(result.response).toBe('Search results:\nsrc/agent/runTurn.ts:1: runTurn')
    expect(events.map(event => event.eventType)).toEqual([
      'input_normalized',
      'reasoning_started',
      'tool_called',
      'tool_result_received',
      'turn_completed',
    ])
  })

  it('recalls persistent memory across turns', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)

    await runTurn(
      'echo durable-memory',
      repository,
      memory,
      permissionRepository,
      'session-3',
    )
    const recall = await runTurn(
      'recall last echo',
      repository,
      memory,
      permissionRepository,
      'session-3',
    )

    expect(recall.response).toBe('Last echo was: durable-memory')
  })

  it('blocks risky input without explicit approval', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)

    const result = await runTurn(
      'echo hi && sudo ls',
      repository,
      memory,
      permissionRepository,
      'session-4',
    )
    const events = repository.listByTurn(result.sessionId, result.turnId)

    expect(result.response).toContain('Permission required for risky input')
    expect(events.map(event => event.eventType)).toEqual([
      'input_normalized',
      'reasoning_started',
      'permission_required',
      'turn_completed',
    ])
  })

  it('grants and reuses permission for risky input', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)

    const first = await runTurn(
      'echo hi && sudo ls',
      repository,
      memory,
      permissionRepository,
      'session-5',
      { approveRisky: true },
    )

    const second = await runTurn(
      'echo hi && sudo ls',
      repository,
      memory,
      permissionRepository,
      'session-5',
    )

    const firstEvents = repository.listByTurn(first.sessionId, first.turnId)
    const secondEvents = repository.listByTurn(second.sessionId, second.turnId)

    expect(first.response).toBe('Echo: hi && sudo ls')
    expect(second.response).toBe('Echo: hi && sudo ls')
    expect(firstEvents.some(event => event.eventType === 'permission_granted')).toBe(true)
    expect(secondEvents.some(event => event.eventType === 'permission_granted')).toBe(true)
    expect(secondEvents.some(event => event.eventType === 'permission_required')).toBe(false)
  })

  it('cancels turn when turnTimeoutMs is 0', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)

    const result = await runTurn(
      'echo timeout-test',
      repository,
      memory,
      permissionRepository,
      'session-timeout',
      { turnTimeoutMs: 0 },
    )
    const events = repository.listByTurn(result.sessionId, result.turnId)

    expect(result.response).toBe('Turn cancelled: tool execution timed out.')
    expect(events.some(e => e.eventType === 'tool_timeout')).toBe(true)
    expect(events.some(e => e.eventType === 'turn_cancelled')).toBe(true)
    expect(events.some(e => e.eventType === 'tool_called')).toBe(false)
  })

  it('retries tool on transient error and succeeds', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)

    let attempts = 0
    const flakyRunner = (args: { content: string }) => {
      attempts++
      if (attempts === 1) throw new Error('transient error')
      return { output: args.content }
    }

    const result = await runTurn(
      'echo retry-me',
      repository,
      memory,
      permissionRepository,
      'session-retry',
      { maxToolRetries: 1, echoToolRunner: flakyRunner },
    )
    const events = repository.listByTurn(result.sessionId, result.turnId)

    expect(result.response).toBe('Echo: retry-me')
    expect(events.some(e => e.eventType === 'tool_retry')).toBe(true)
    expect(events.some(e => e.eventType === 'tool_result_received')).toBe(true)
  })

  it('returns graceful error response when all retries exhausted', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)

    const alwaysThrows = () => { throw new Error('permanent failure') }

    const result = await runTurn(
      'echo fail-me',
      repository,
      memory,
      permissionRepository,
      'session-error',
      { maxToolRetries: 0, echoToolRunner: alwaysThrows },
    )
    const events = repository.listByTurn(result.sessionId, result.turnId)

    expect(result.response).toBe('Tool execution failed. Please try again.')
    expect(events.some(e => e.eventType === 'tool_error')).toBe(true)
    expect(events.some(e => e.eventType === 'turn_completed')).toBe(true)
  })

  it('uses llm responder when no tool command is detected', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)

    const result = await runTurn(
      'what is the project status',
      repository,
      memory,
      permissionRepository,
      'session-llm',
      {
        llmResponder: async args => `LLM says: ${args.input}`,
      },
    )
    const events = repository.listByTurn(result.sessionId, result.turnId)

    expect(result.response).toBe('LLM says: what is the project status')
    expect(events.some(e => e.eventType === 'llm_called')).toBe(true)
    expect(events.some(e => e.eventType === 'llm_result_received')).toBe(true)
  })

  it('emits llm_model_resolved event with decisionLog when llmModelConfig is provided', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)

    const result = await runTurn(
      'tell me about today',
      repository,
      memory,
      permissionRepository,
      'session-model-resolved',
      {
        llmResponder: async args => `LLM: ${args.input}`,
        llmModelConfig: {
          model: 'gpt-4o-mini',
          source: 'preference',
          fallbackModel: null,
          decisionLog: ["model: user preference ('gpt-4o-mini')", 'fallback: none'],
          timeoutMs: 20000,
          maxRetries: 1,
          temperature: 0.2,
          maxOutputTokens: null,
        },
      },
    )
    const events = repository.listByTurn(result.sessionId, result.turnId)
    const modelEvent = events.find(e => e.eventType === 'llm_model_resolved')

    expect(modelEvent).toBeDefined()
    const payload = modelEvent!.payload
    expect(payload['model']).toBe('gpt-4o-mini')
    expect(payload['source']).toBe('preference')
    expect(Array.isArray(payload['decisionLog'])).toBe(true)
    // llm_model_resolved must appear before llm_called
    const resolvedIdx = events.findIndex(e => e.eventType === 'llm_model_resolved')
    const calledIdx = events.findIndex(e => e.eventType === 'llm_called')
    expect(resolvedIdx).toBeLessThan(calledIdx)
  })

  it('auto-consolidates memory when configured thresholds are met', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memoryRepository = new MemoryFactRepository(db)
    const preferenceRepository = new PreferenceRepository(db)
    const memory = createMemoryCoordinator(
      new PersistentMemoryStore(memoryRepository),
      new PreferenceStore(preferenceRepository),
    )
    const permissionRepository = new ToolPermissionRepository(db)

    memoryRepository.upsert('persistent', 'old_low', 'to-prune', 0.1, '2000-01-01T00:00:00.000Z')

    const result = await runTurn(
      'echo trigger-auto-consolidate',
      repository,
      memory,
      permissionRepository,
      'session-auto-consolidate',
      {
        autoConsolidationConfig: {
          enabled: true,
          minTurns: 1,
          minHoursSinceLastConsolidation: 0,
          minStaleFacts: 1,
          minLowConfidenceFacts: 1,
        },
      },
    )

    const events = repository.listByTurn(result.sessionId, result.turnId)
    expect(events.some(e => e.eventType === 'memory_auto_consolidated')).toBe(true)
    expect(memory.persistent.get('old_low')).toBeNull()
    expect(memory.persistent.get('__last_consolidated_at')).not.toBeNull()
  })

  it('skips auto consolidation when thresholds are not met', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)

    const result = await runTurn(
      'echo no-auto-consolidate',
      repository,
      memory,
      permissionRepository,
      'session-auto-skip',
      {
        autoConsolidationConfig: {
          enabled: true,
          minTurns: 5,
          minHoursSinceLastConsolidation: 24,
          minStaleFacts: 2,
          minLowConfidenceFacts: 2,
        },
      },
    )

    const events = repository.listByTurn(result.sessionId, result.turnId)
    expect(events.some(e => e.eventType === 'memory_auto_consolidation_skipped')).toBe(true)
  })

  it('writes task checkpoints before and after successful tool execution', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)
    const checkpoints: Array<{ status: string; stepIndex: number; phase: unknown }> = []

    await runTurn(
      'echo checkpoint-success',
      repository,
      memory,
      permissionRepository,
      'session-checkpoint-success',
      {
        taskId: 'task-success-1',
        taskCheckpointWriter: checkpoint => {
          checkpoints.push({
            status: checkpoint.status,
            stepIndex: checkpoint.stepIndex,
            phase: checkpoint.payload['phase'],
          })
        },
      },
    )

    expect(checkpoints).toEqual([
      { status: 'running', stepIndex: 1, phase: 'before_tool_execution' },
      { status: 'completed', stepIndex: 2, phase: 'after_tool_execution' },
    ])
  })

  it('writes failed task checkpoint when tool execution fails', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)
    const permissionRepository = new ToolPermissionRepository(db)
    const checkpoints: Array<{ status: string; stepIndex: number; phase: unknown }> = []

    await runTurn(
      'echo checkpoint-fail',
      repository,
      memory,
      permissionRepository,
      'session-checkpoint-fail',
      {
        taskId: 'task-fail-1',
        maxToolRetries: 0,
        echoToolRunner: () => {
          throw new Error('forced failure')
        },
        taskCheckpointWriter: checkpoint => {
          checkpoints.push({
            status: checkpoint.status,
            stepIndex: checkpoint.stepIndex,
            phase: checkpoint.payload['phase'],
          })
        },
      },
    )

    expect(checkpoints).toEqual([
      { status: 'running', stepIndex: 1, phase: 'before_tool_execution' },
      { status: 'failed', stepIndex: 2, phase: 'tool_execution_failed' },
    ])
  })
})
