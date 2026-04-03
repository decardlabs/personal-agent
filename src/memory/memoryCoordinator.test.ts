import { describe, expect, it } from 'vitest'
import { initializeDatabase } from '../storage/db.js'
import { applyMigrations } from '../storage/migrate.js'
import { MemoryFactRepository } from '../storage/memoryFactRepository.js'
import { PreferenceRepository } from '../storage/preferenceRepository.js'
import { PersistentMemoryStore } from './persistentMemory.js'
import { PreferenceStore } from './preferenceMemory.js'
import { createMemoryCoordinator } from './memoryCoordinator.js'

describe('MemoryCoordinator', () => {
  it('retrieves merged memory bundle for LLM', () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)

    const memoryRepo = new MemoryFactRepository(db)
    const prefRepo = new PreferenceRepository(db)

    const persistent = new PersistentMemoryStore(memoryRepo)
    const preferences = new PreferenceStore(prefRepo)
    const memory = createMemoryCoordinator(persistent, preferences)

    memory.preferences.set('lang', 'python')
    memory.persistent.set('fact_a', 'value_a', 0.9)
    memory.session.pushHistory('session-1', { input: 'echo hello', response: 'Echo: hello' })
    memory.session.pushHistory('session-1', { input: 'recall last echo', response: 'Last echo was: hello' })

    const bundle = memory.retrieveForLLM('session-1', {
      historyLimit: 1,
      factLimit: 1,
      minFactConfidence: 0.5,
    })

    expect(bundle.preferences).toEqual([{ key: 'lang', value: 'python' }])
    expect(bundle.history.length).toBe(1)
    expect(bundle.persistentFacts.length).toBe(1)
    expect(bundle.context.cwd.length).toBeGreaterThan(0)
  })

  it('returns memory diagnostics', () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)

    const memoryRepo = new MemoryFactRepository(db)
    const prefRepo = new PreferenceRepository(db)

    const persistent = new PersistentMemoryStore(memoryRepo)
    const preferences = new PreferenceStore(prefRepo)
    const memory = createMemoryCoordinator(persistent, preferences)

    memory.preferences.set('theme', 'light')
    memory.persistent.set('fact', 'x', 0.8)
    memory.session.pushHistory('session-2', { input: 'echo hi', response: 'Echo: hi' })

    const diag = memory.getDiagnostics('session-2')

    expect(diag.preferenceCount).toBe(1)
    expect(diag.persistentFactCount).toBe(1)
    expect(diag.historyTurns).toBe(1)
  })
})
