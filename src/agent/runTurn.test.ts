import { describe, expect, it } from 'vitest'
import { initializeDatabase } from '../storage/db.js'
import { applyMigrations } from '../storage/migrate.js'
import { SessionEventRepository } from '../storage/sessionEventRepository.js'
import { runTurn } from './runTurn.js'
import { getCurrentState } from './stateMachine.js'
import { MemoryFactRepository } from '../storage/memoryFactRepository.js'
import { PersistentMemoryStore } from '../memory/persistentMemory.js'
import { createMemoryCoordinator } from '../memory/memoryCoordinator.js'
import { ToolPermissionRepository } from '../storage/toolPermissionRepository.js'

describe('runTurn', () => {
  it('runs echo flow and persists events in order', () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memoryRepository = new MemoryFactRepository(db)
    const memory = createMemoryCoordinator(
      new PersistentMemoryStore(memoryRepository),
    )
    const permissionRepository = new ToolPermissionRepository(db)

    const result = runTurn(
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
    expect(getCurrentState()).toBe('done')
  })

  it('returns fallback response when no tool command is detected', () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memoryRepository = new MemoryFactRepository(db)
    const memory = createMemoryCoordinator(
      new PersistentMemoryStore(memoryRepository),
    )
    const permissionRepository = new ToolPermissionRepository(db)

    const result = runTurn(
      'what can you do',
      repository,
      memory,
      permissionRepository,
      'session-2',
    )
    const events = repository.listByTurn(result.sessionId, result.turnId)

    expect(result.response).toContain('I can run echo only in this MVP')
    expect(events.map(event => event.eventType)).toEqual([
      'input_normalized',
      'reasoning_started',
      'turn_completed',
    ])
  })

  it('recalls persistent memory across turns', () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memoryRepository = new MemoryFactRepository(db)
    const memory = createMemoryCoordinator(
      new PersistentMemoryStore(memoryRepository),
    )
    const permissionRepository = new ToolPermissionRepository(db)

    runTurn(
      'echo durable-memory',
      repository,
      memory,
      permissionRepository,
      'session-3',
    )
    const recall = runTurn(
      'recall last echo',
      repository,
      memory,
      permissionRepository,
      'session-3',
    )

    expect(recall.response).toBe('Last echo was: durable-memory')
  })

  it('blocks risky input without explicit approval', () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memoryRepository = new MemoryFactRepository(db)
    const memory = createMemoryCoordinator(
      new PersistentMemoryStore(memoryRepository),
    )
    const permissionRepository = new ToolPermissionRepository(db)

    const result = runTurn(
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

  it('grants and reuses permission for risky input', () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memoryRepository = new MemoryFactRepository(db)
    const memory = createMemoryCoordinator(
      new PersistentMemoryStore(memoryRepository),
    )
    const permissionRepository = new ToolPermissionRepository(db)

    const first = runTurn(
      'echo hi && sudo ls',
      repository,
      memory,
      permissionRepository,
      'session-5',
      { approveRisky: true },
    )

    const second = runTurn(
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
})
