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

  it('ranks memory facts by confidence and recency', () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)

    const repository = new MemoryFactRepository(db)
    const store = new PersistentMemoryStore(repository)

    repository.upsert('persistent', 'old_high', 'A', 0.95, '2020-01-01T00:00:00.000Z')
    repository.upsert('persistent', 'recent_mid', 'B', 0.8, new Date().toISOString())

    const ranked = store.listRankedFacts(2, 0)

    expect(ranked[0]?.key).toBe('recent_mid')
    expect(ranked[1]?.key).toBe('old_high')
  })

  it('reports health snapshot and consolidation recommendation', () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)

    const repository = new MemoryFactRepository(db)
    const store = new PersistentMemoryStore(repository)

    for (let i = 0; i < 5; i++) {
      repository.upsert('persistent', `stale_${i}`, `v${i}`, 0.3, '2000-01-01T00:00:00.000Z')
    }

    const health = store.getHealthSnapshot()

    expect(health.totalFacts).toBe(5)
    expect(health.staleFacts).toBe(5)
    expect(health.lowConfidenceFacts).toBe(5)
    expect(health.recommendedAction).toBe('consolidate')
  })
})
