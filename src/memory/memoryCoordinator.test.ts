import { describe, expect, it } from 'vitest'
import { initializeDatabase } from '../storage/db.js'
import { applyMigrations } from '../storage/migrate.js'
import { MemoryFactRepository } from '../storage/memoryFactRepository.js'
import { PreferenceRepository } from '../storage/preferenceRepository.js'
import { PersistentMemoryStore } from './persistentMemory.js'
import { PreferenceStore } from './preferenceMemory.js'
import { createMemoryCoordinator } from './memoryCoordinator.js'
import { SessionMemoryStore } from './sessionMemory.js'

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
    expect(diag.staleFactCount).toBeGreaterThanOrEqual(0)
    expect(diag.lowConfidenceFactCount).toBeGreaterThanOrEqual(0)
    expect(['ok', 'review', 'consolidate']).toContain(diag.recommendedAction)
  })

  describe('history window standardization', () => {
    it('applies default historiLimit=10 when not specified', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // Push 15 entries
      for (let i = 0; i < 15; i++) {
        memory.session.pushHistory('session-1', { input: `q-${i}`, response: `r-${i}` })
      }

      // Default should limit to 10 most recent
      const bundle = memory.retrieveForLLM('session-1')
      expect(bundle.history.length).toBe(10)
      expect(bundle.history[0]).toEqual({ input: 'q-5', response: 'r-5' })
      expect(bundle.history[9]).toEqual({ input: 'q-14', response: 'r-14' })
    })

    it('respects custom historyLimit parameter', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // Push 10 entries
      for (let i = 0; i < 10; i++) {
        memory.session.pushHistory('session-1', { input: `q-${i}`, response: `r-${i}` })
      }

      // Custom limit of 3
      const bundle = memory.retrieveForLLM('session-1', { historyLimit: 3 })
      expect(bundle.history.length).toBe(3)
      expect(bundle.history[0]).toEqual({ input: 'q-7', response: 'r-7' })
      expect(bundle.history[2]).toEqual({ input: 'q-9', response: 'r-9' })
    })

    it('handles edge case: historyLimit larger than available history', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // Push only 3 entries
      for (let i = 0; i < 3; i++) {
        memory.session.pushHistory('session-1', { input: `q-${i}`, response: `r-${i}` })
      }

      // Request limit of 100
      const bundle = memory.retrieveForLLM('session-1', { historyLimit: 100 })
      expect(bundle.history.length).toBe(3)
      expect(bundle.history).toEqual([
        { input: 'q-0', response: 'r-0' },
        { input: 'q-1', response: 'r-1' },
        { input: 'q-2', response: 'r-2' },
      ])
    })

    it('handles edge case: empty session', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // No history added
      const bundle = memory.retrieveForLLM('session-1')
      expect(bundle.history.length).toBe(0)
      expect(bundle.history).toEqual([])
    })

    it('handles edge case: historyLimit=0', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      memory.session.pushHistory('session-1', { input: 'q-0', response: 'r-0' })

      // historyLimit=0 should return empty
      const bundle = memory.retrieveForLLM('session-1', { historyLimit: 0 })
      expect(bundle.history.length).toBe(0)
    })

    it('applies two-layer window (storage enforces max, retrieval slices)', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // Push 20 entries (storage will keep only last 10, default window)
      for (let i = 0; i < 20; i++) {
        memory.session.pushHistory('session-1', { input: `q-${i}`, response: `r-${i}` })
      }

      // Verify storage layer enforced 10-entry max
      const storageHistory = memory.session.getHistory('session-1')
      expect(storageHistory.length).toBe(10)
      expect(storageHistory[0]).toEqual({ input: 'q-10', response: 'r-10' })

      // Verify retrieval layer can further limit to 3
      const bundle = memory.retrieveForLLM('session-1', { historyLimit: 3 })
      expect(bundle.history.length).toBe(3)
      expect(bundle.history[0]).toEqual({ input: 'q-17', response: 'r-17' })
      expect(bundle.history[2]).toEqual({ input: 'q-19', response: 'r-19' })
    })

    it('maintains history order: newest entries last', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // Push entries with explicit ordering
      memory.session.pushHistory('session-1', { input: 'first', response: 'resp-1' })
      memory.session.pushHistory('session-1', { input: 'second', response: 'resp-2' })
      memory.session.pushHistory('session-1', { input: 'third', response: 'resp-3' })

      const bundle = memory.retrieveForLLM('session-1', { historyLimit: 10 })
      expect(bundle.history).toEqual([
        { input: 'first', response: 'resp-1' },
        { input: 'second', response: 'resp-2' },
        { input: 'third', response: 'resp-3' },
      ])
    })

    it('diagnostics report correct history turn count', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      for (let i = 0; i < 7; i++) {
        memory.session.pushHistory('session-1', { input: `q-${i}`, response: `r-${i}` })
      }

      const diag = memory.getDiagnostics('session-1')
      expect(diag.historyTurns).toBe(7)
    })
  })

  describe('LLM context bundle building', () => {
    it('buildLLMContextBundle returns unified structure with all required fields', () => {
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
      memory.session.pushHistory('session-1', { input: 'search project', response: 'Found results' })

      const bundle = memory.buildLLMContextBundle('session-1')

      expect(bundle).toHaveProperty('context')
      expect(bundle).toHaveProperty('preferences')
      expect(bundle).toHaveProperty('history')
      expect(bundle).toHaveProperty('persistentFacts')
      
      expect(bundle.context.cwd.length).toBeGreaterThan(0)
      expect(bundle.context.platform.length).toBeGreaterThan(0)
      expect(bundle.context.timestamp.length).toBeGreaterThan(0)
      
      expect(bundle.preferences).toEqual([{ key: 'lang', value: 'python' }])
      expect(bundle.history.length).toBe(2)
      expect(bundle.history[0]).toEqual({ input: 'echo hello', response: 'Echo: hello' })
      expect(bundle.history[1]).toEqual({ input: 'search project', response: 'Found results' })
      
      expect(bundle.persistentFacts.length).toBe(1)
      expect(bundle.persistentFacts[0].key).toBe('fact_a')
      expect(bundle.persistentFacts[0].confidence).toBe(0.9)
    })

    it('buildLLMContextBundle respects historyLimit option', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // Push 5 entries
      for (let i = 0; i < 5; i++) {
        memory.session.pushHistory('session-1', { input: `q-${i}`, response: `r-${i}` })
      }

      // Request only 2
      const bundle = memory.buildLLMContextBundle('session-1', { historyLimit: 2 })
      expect(bundle.history.length).toBe(2)
      expect(bundle.history[0]).toEqual({ input: 'q-3', response: 'r-3' })
      expect(bundle.history[1]).toEqual({ input: 'q-4', response: 'r-4' })
    })

    it('buildLLMContextBundle respects factLimit and minFactConfidence options', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // Store facts with different confidence levels
      memory.persistent.set('high_conf', 'value1', 0.95)
      memory.persistent.set('mid_conf', 'value2', 0.6)
      memory.persistent.set('low_conf', 'value3', 0.2)

      // Request with minFactConfidence=0.5 (should exclude low_conf)
      const bundle = memory.buildLLMContextBundle('session-1', {
        factLimit: 10,
        minFactConfidence: 0.5,
      })
      
      expect(bundle.persistentFacts.length).toBe(2)
      const hasHighConf = bundle.persistentFacts.some(f => f.key === 'high_conf')
      const hasMidConf = bundle.persistentFacts.some(f => f.key === 'mid_conf')
      const hasLowConf = bundle.persistentFacts.some(f => f.key === 'low_conf')
      
      expect(hasHighConf).toBe(true)
      expect(hasMidConf).toBe(true)
      expect(hasLowConf).toBe(false)
    })

    it('buildLLMContextBundle is identical to retrieveForLLM when options match', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      memory.preferences.set('theme', 'dark')
      memory.persistent.set('note', 'test', 0.8)
      memory.session.pushHistory('session-1', { input: 'hello', response: 'world' })

      const bundle1 = memory.buildLLMContextBundle('session-1', {
        historyLimit: 10,
        factLimit: 10,
        minFactConfidence: 0.4,
      })
      
      const bundle2 = memory.retrieveForLLM('session-1', {
        historyLimit: 10,
        factLimit: 10,
        minFactConfidence: 0.4,
      })

      // Context often differs by milliseconds, so check fields individually
      expect(bundle1.context.cwd).toBe(bundle2.context.cwd)
      expect(bundle1.context.platform).toBe(bundle2.context.platform)
      expect(bundle1.preferences).toEqual(bundle2.preferences)
      expect(bundle1.history).toEqual(bundle2.history)
      expect(bundle1.persistentFacts.length).toBe(bundle2.persistentFacts.length)
    })

    it('buildLLMContextBundle handles empty session', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      const bundle = memory.buildLLMContextBundle('empty-session')

      expect(bundle.context).toBeDefined()
      expect(bundle.preferences).toEqual([])
      expect(bundle.history).toEqual([])
      expect(bundle.persistentFacts).toEqual([])
    })
  })

  describe('memory write-back hardening', () => {
    it('evaluates write decisions with confidence thresholds', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // High confidence write should be allowed
      const highConfResult = memory.evaluatePersistentWrite('last_echo_output', 'result', 0.85)
      expect(highConfResult.allowed).toBe(true)
      expect(highConfResult.minimumRequired).toBe(0.7)

      // Low confidence write should be rejected
      const lowConfResult = memory.evaluatePersistentWrite('last_echo_output', 'result', 0.6)
      expect(lowConfResult.allowed).toBe(false)
      expect(lowConfResult.minimumRequired).toBe(0.7)
    })

    it('allows bookkeeping keys to bypass confidence checks', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // Bookkeeping key with zero confidence should still be allowed
      const result = memory.evaluatePersistentWrite('__last_consolidated_at', '2026-04-03', 0)
      expect(result.allowed).toBe(true)
      expect(result.reason).toContain('bookkeeping')
    })

    it('records write decisions in audit trail', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // Make several write evaluation calls
      memory.evaluatePersistentWrite('key1', 'value1', 0.8)
      memory.evaluatePersistentWrite('key2', 'value2', 0.3)
      memory.evaluatePersistentWrite('key3', 'value3', 0.9)

      const trail = memory.getWriteAuditTrail()
      expect(trail.size()).toBe(3)

      const recent = trail.getRecent(10)
      expect(recent.length).toBe(3)
      expect(recent[0].proposedConfidence).toBe(0.8)
      expect(recent[1].proposedConfidence).toBe(0.3)
      expect(recent[2].proposedConfidence).toBe(0.9)
    })

    it('filters audit trail by key', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // Write decisions for multiple keys
      memory.evaluatePersistentWrite('user_pref', 'value1', 0.7)
      memory.evaluatePersistentWrite('other_key', 'value2', 0.8)
      memory.evaluatePersistentWrite('user_pref', 'value3', 0.6)

      const trail = memory.getWriteAuditTrail()
      const userPrefEntries = trail.getByKey('user_pref', 10)

      expect(userPrefEntries.length).toBe(2)
      expect(userPrefEntries.every(e => e.key === 'user_pref')).toBe(true)
      expect(userPrefEntries[0].proposedConfidence).toBe(0.7)
      expect(userPrefEntries[1].proposedConfidence).toBe(0.6)
    })

    it('applies default confidence threshold to unknown keys', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // Unknown key with default threshold (0.5)
      const result1 = memory.evaluatePersistentWrite('custom_unknown_key', 'data', 0.55)
      expect(result1.allowed).toBe(true)
      expect(result1.minimumRequired).toBe(0.5)

      const result2 = memory.evaluatePersistentWrite('custom_unknown_key', 'data', 0.45)
      expect(result2.allowed).toBe(false)
      expect(result2.minimumRequired).toBe(0.5)
    })

    it('tracks decision audit trail for consolidation safety inspection', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // Simulate multiple write decisions with mixed results
      const decisions = [
        { key: 'fact1', conf: 0.9, expected: true },
        { key: 'fact2', conf: 0.3, expected: false },
        { key: 'fact3', conf: 0.8, expected: true },
        { key: 'fact4', conf: 0.2, expected: false },
      ]

      for (const d of decisions) {
        const result = memory.evaluatePersistentWrite(d.key, 'value', d.conf)
        expect(result.allowed).toBe(d.expected)
      }

      const trail = memory.getWriteAuditTrail()
      const recentDecisions = trail.getRecent(10)

      // Verify audit trail contains decision information
      const allowedCount = recentDecisions.filter(e => e.decision.allowed).length
      const rejectedCount = recentDecisions.filter(e => !e.decision.allowed).length

      expect(allowedCount).toBe(2)
      expect(rejectedCount).toBe(2)
    })
  })

  describe('memory diagnostics with write-decision observability', () => {
    it('includes write-decision counts in diagnostics', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // Make various write decisions
      memory.evaluatePersistentWrite('key1', 'val1', 0.8)  // allowed
      memory.evaluatePersistentWrite('key2', 'val2', 0.4)  // rejected
      memory.evaluatePersistentWrite('key3', 'val3', 0.9)  // allowed

      const diag = memory.getDiagnostics('session-1')

      expect(diag.writeDecisionsTotal).toBe(3)
      expect(diag.writeDecisionsAllowed).toBe(2)
      expect(diag.writeDecisionsRejected).toBe(1)
      expect(diag.writeDecisionAcceptanceRate).toBeCloseTo(0.667, 2)
    })

    it('shows 100% acceptance rate when all decisions allowed', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // All allowed
      memory.evaluatePersistentWrite('key1', 'val1', 0.9)
      memory.evaluatePersistentWrite('key2', 'val2', 0.8)

      const diag = memory.getDiagnostics('session-1')

      expect(diag.writeDecisionsTotal).toBe(2)
      expect(diag.writeDecisionsRejected).toBe(0)
      expect(diag.writeDecisionAcceptanceRate).toBe(1)
    })

    it('shows 0% acceptance rate when all decisions rejected', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // All rejected
      memory.evaluatePersistentWrite('key1', 'val1', 0.3)
      memory.evaluatePersistentWrite('key2', 'val2', 0.2)

      const diag = memory.getDiagnostics('session-1')

      expect(diag.writeDecisionsTotal).toBe(2)
      expect(diag.writeDecisionsAllowed).toBe(0)
      expect(diag.writeDecisionAcceptanceRate).toBe(0)
    })

    it('shows 1.0 (100%) acceptence rate when no decisions made', () => {
      const db = initializeDatabase(':memory:')
      applyMigrations(db)

      const memoryRepo = new MemoryFactRepository(db)
      const prefRepo = new PreferenceRepository(db)

      const persistent = new PersistentMemoryStore(memoryRepo)
      const preferences = new PreferenceStore(prefRepo)
      const memory = createMemoryCoordinator(persistent, preferences)

      // No write decisions
      const diag = memory.getDiagnostics('session-1')

      expect(diag.writeDecisionsTotal).toBe(0)
      expect(diag.writeDecisionAcceptanceRate).toBe(1) // Perfect rate when no decisions
    })
  })
})
