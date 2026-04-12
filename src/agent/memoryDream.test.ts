import { describe, expect, it } from 'vitest'
import { initializeDatabase } from '../storage/db.js'
import { applyMigrations } from '../storage/migrate.js'
import { SessionEventRepository } from '../storage/sessionEventRepository.js'
import { MemoryFactRepository } from '../storage/memoryFactRepository.js'
import { PreferenceRepository } from '../storage/preferenceRepository.js'
import { PersistentMemoryStore } from '../memory/persistentMemory.js'
import { PreferenceStore } from '../memory/preferenceMemory.js'
import { createMemoryCoordinator } from '../memory/memoryCoordinator.js'
import { maybeRunMemoryDream, type MemoryDreamConfig } from './memoryDream.js'

function createMemory(db: ReturnType<typeof initializeDatabase>) {
  const memoryRepository = new MemoryFactRepository(db)
  const preferenceRepository = new PreferenceRepository(db)
  return createMemoryCoordinator(
    new PersistentMemoryStore(memoryRepository),
    new PreferenceStore(preferenceRepository),
  )
}

function createConfig(overrides: Partial<MemoryDreamConfig> = {}): MemoryDreamConfig {
  return {
    enabled: true,
    minSessionCount: 1,
    minHoursSinceLastDream: 0,
    maxSourceTurns: 4,
    minFactConfidence: 0.75,
    maxFactsToWrite: 4,
    lockTtlMs: 1000,
    ...overrides,
  }
}

describe('memoryDream', () => {
  it('writes high-confidence synthesized facts and prunes stale low-confidence facts', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memoryRepository = new MemoryFactRepository(db)
    const preferenceRepository = new PreferenceRepository(db)
    const memory = createMemoryCoordinator(
      new PersistentMemoryStore(memoryRepository),
      new PreferenceStore(preferenceRepository),
    )

    memoryRepository.upsert('persistent', 'old_low', 'stale', 0.1, '2000-01-01T00:00:00.000Z')
    repository.save({
      sessionId: 'seed-session',
      turnId: 'seed-turn',
      eventType: 'turn_completed',
      payload: {
        input: 'remember that the repo is personal-agent',
        response: 'Noted.',
      },
      createdAt: '2026-04-01T00:00:00.000Z',
    })

    const result = await maybeRunMemoryDream({
      sessionId: 'dream-session',
      input: 'summarize what you know',
      response: 'Working on it.',
      repository,
      memory,
      options: {
        llmResponder: async () => JSON.stringify([
          { key: 'project_name', value: 'personal-agent', confidence: 0.92 },
          { key: 'ephemeral_detail', value: 'discard me', confidence: 0.2 },
        ]),
      },
      config: createConfig(),
    })

    expect(result.triggered).toBe(true)
    expect(result.wroteFactCount).toBe(1)
    expect(result.rejectedFactCount).toBe(1)
    expect(result.removedCount).toBe(1)
    expect(result.sourceTurnCount).toBe(2)
    expect(memory.persistent.get('project_name')).toBe('personal-agent')
    expect(memory.persistent.get('old_low')).toBeNull()
    expect(memory.persistent.get('__last_memory_dream_at')).not.toBeNull()
    expect(memory.persistent.get('__last_memory_dream_status')).toBe('completed')
    expect(memory.persistent.get('__last_memory_dream_reason')).toBe('triggered')
  })

  it('skips when an active dream lock is present', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)

    repository.save({
      sessionId: 'seed-session',
      turnId: 'seed-turn',
      eventType: 'turn_completed',
      payload: {
        input: 'seed',
        response: 'seed',
      },
      createdAt: '2026-04-01T00:00:00.000Z',
    })
    memory.persistent.set('__memory_dream_lock_until', new Date(Date.now() + 60_000).toISOString(), 1)

    let called = false
    const result = await maybeRunMemoryDream({
      sessionId: 'dream-session',
      input: 'trigger',
      response: 'triggered',
      repository,
      memory,
      options: {
        llmResponder: async () => {
          called = true
          return '[]'
        },
      },
      config: createConfig(),
    })

    expect(result.triggered).toBe(false)
    expect(result.reason).toBe('locked')
    expect(called).toBe(false)
    expect(memory.persistent.get('__last_memory_dream_status')).toBe('skipped')
    expect(memory.persistent.get('__last_memory_dream_reason')).toBe('locked')
  })

  it('returns disabled when dream feature is disabled', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)

    const result = await maybeRunMemoryDream({
      sessionId: 'dream-session',
      input: 'trigger',
      response: 'triggered',
      repository,
      memory,
      options: {
        llmResponder: async () => '[]',
      },
      config: createConfig({ enabled: false }),
    })

    expect(result.triggered).toBe(false)
    expect(result.reason).toBe('disabled')
    expect(memory.persistent.get('__last_memory_dream_reason')).toBe('disabled')
  })

  it('returns llm_unavailable when no llm responder exists', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)

    const result = await maybeRunMemoryDream({
      sessionId: 'dream-session',
      input: 'trigger',
      response: 'triggered',
      repository,
      memory,
      options: {},
      config: createConfig(),
    })

    expect(result.triggered).toBe(false)
    expect(result.reason).toBe('llm_unavailable')
    expect(memory.persistent.get('__last_memory_dream_reason')).toBe('llm_unavailable')
  })

  it('returns insufficient_sessions when minimum session count is not met', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)

    const result = await maybeRunMemoryDream({
      sessionId: 'dream-session',
      input: 'trigger',
      response: 'triggered',
      repository,
      memory,
      options: {
        llmResponder: async () => '[]',
      },
      config: createConfig({ minSessionCount: 2 }),
    })

    expect(result.triggered).toBe(false)
    expect(result.reason.startsWith('insufficient_sessions:')).toBe(true)
  })

  it('returns too_soon when cooldown window is not reached', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)

    repository.save({
      sessionId: 'seed-session',
      turnId: 'seed-turn',
      eventType: 'turn_completed',
      payload: { input: 'seed', response: 'seed' },
      createdAt: '2026-04-01T00:00:00.000Z',
    })
    memory.persistent.set('__last_memory_dream_at', new Date().toISOString(), 1)

    const result = await maybeRunMemoryDream({
      sessionId: 'dream-session',
      input: 'trigger',
      response: 'triggered',
      repository,
      memory,
      options: {
        llmResponder: async () => '[]',
      },
      config: createConfig({ minHoursSinceLastDream: 24 }),
    })

    expect(result.triggered).toBe(false)
    expect(result.reason.startsWith('too_soon:')).toBe(true)
  })

  it('returns llm_failed and clears lock when llm throws', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)
    const memory = createMemory(db)

    repository.save({
      sessionId: 'seed-session',
      turnId: 'seed-turn',
      eventType: 'turn_completed',
      payload: { input: 'seed', response: 'seed' },
      createdAt: '2026-04-01T00:00:00.000Z',
    })

    const result = await maybeRunMemoryDream({
      sessionId: 'dream-session',
      input: 'trigger',
      response: 'triggered',
      repository,
      memory,
      options: {
        llmResponder: async () => {
          throw new Error('boom')
        },
      },
      config: createConfig(),
    })

    expect(result.triggered).toBe(false)
    expect(result.reason).toBe('llm_failed')
    expect(memory.persistent.get('__last_memory_dream_reason')).toBe('llm_failed')
    expect(memory.persistent.get('__memory_dream_lock_until')).toBe('1970-01-01T00:00:00.000Z')
  })
})
