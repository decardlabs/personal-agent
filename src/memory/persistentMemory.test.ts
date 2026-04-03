import { describe, expect, it } from 'vitest'
import { initializeDatabase } from '../storage/db.js'
import { applyMigrations } from '../storage/migrate.js'
import { MemoryFactRepository } from '../storage/memoryFactRepository.js'
import { PersistentMemoryStore } from './persistentMemory.js'

describe('PersistentMemoryStore', () => {
  it('lists persistent facts with confidence filtering', () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)

    const repository = new MemoryFactRepository(db)
    const store = new PersistentMemoryStore(repository)

    store.set('fact_high', 'alpha', 0.9)
    store.set('fact_low', 'beta', 0.2)

    const facts = store.listFacts(10, 0.5)
    expect(facts.map(f => f.key)).toEqual(['fact_high'])
  })

  it('consolidates stale low-confidence facts', () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)

    const repository = new MemoryFactRepository(db)
    const store = new PersistentMemoryStore(repository)

    repository.upsert('persistent', 'stale_fact', 'to-prune', 0.1, '2000-01-01T00:00:00.000Z')
    repository.upsert('persistent', 'fresh_fact', 'to-keep', 0.8, new Date().toISOString())

    const result = store.consolidate({
      minConfidenceToKeep: 0.5,
      maxAgeDays: 30,
      keepKeys: ['last_echo_output'],
    })

    expect(result.removedCount).toBe(1)
    expect(store.get('stale_fact')).toBeNull()
    expect(store.get('fresh_fact')).toBe('to-keep')
  })
})
