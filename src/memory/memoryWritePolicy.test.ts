import { describe, expect, it } from 'vitest'
import {
  createMemoryWritePolicy,
  MemoryWriteAuditTrail,
  shouldBypassConfidenceCheck,
} from './memoryWritePolicy.js'

describe('memoryWritePolicy', () => {
  describe('createMemoryWritePolicy', () => {
    it('allows writes with sufficient confidence', () => {
      const policy = createMemoryWritePolicy()
      const result = policy.evaluateWrite('last_echo_output', 'hello', 0.85)

      expect(result.allowed).toBe(true)
      expect(result.confidence).toBe(0.85)
      expect(result.minimumRequired).toBe(0.7)
    })

    it('rejects writes with insufficient confidence', () => {
      const policy = createMemoryWritePolicy()
      const result = policy.evaluateWrite('last_echo_output', 'hello', 0.6)

      expect(result.allowed).toBe(false)
      expect(result.confidence).toBe(0.6)
      expect(result.minimumRequired).toBe(0.7)
      expect(result.reason).toContain('below minimum')
    })

    it('applies default threshold to unknown keys', () => {
      const policy = createMemoryWritePolicy()
      const result = policy.evaluateWrite('unknown_key', 'value', 0.55)

      expect(result.allowed).toBe(true)
      // Default wildcard is 0.5
      expect(result.minimumRequired).toBe(0.5)
    })

    it('rejects writes below default threshold', () => {
      const policy = createMemoryWritePolicy()
      const result = policy.evaluateWrite('unknown_key', 'value', 0.4)

      expect(result.allowed).toBe(false)
      expect(result.minimumRequired).toBe(0.5)
    })

    it('allows exact-confidence matches', () => {
      const policy = createMemoryWritePolicy()

      // Confidence exactly at threshold
      const result = policy.evaluateWrite('last_echo_output', 'data', 0.7)
      expect(result.allowed).toBe(true)
    })

    it('provides descriptive reason for rejections', () => {
      const policy = createMemoryWritePolicy()
      const result = policy.evaluateWrite('last_echo_output', 'bad', 0.5)

      expect(result.reason).toContain('confidence')
      expect(result.reason).toContain('0.50')
      expect(result.reason).toContain('0.70')
    })
  })

  describe('shouldBypassConfidenceCheck', () => {
    it('bypasses bookkeeping keys starting with double underscore', () => {
      expect(shouldBypassConfidenceCheck('__last_consolidated_at')).toBe(true)
      expect(shouldBypassConfidenceCheck('__internal_flag')).toBe(true)
      expect(shouldBypassConfidenceCheck('__test')).toBe(true)
    })

    it('does not bypass regular keys', () => {
      expect(shouldBypassConfidenceCheck('last_echo_output')).toBe(false)
      expect(shouldBypassConfidenceCheck('_single_underscore')).toBe(false)
      expect(shouldBypassConfidenceCheck('normal_key')).toBe(false)
    })
  })

  describe('MemoryWriteAuditTrail', () => {
    it('records write decisions', () => {
      const trail = new MemoryWriteAuditTrail()
      const now = new Date().toISOString()

      trail.record({
        timestamp: now,
        key: 'test_key',
        value: 'test_value',
        proposedConfidence: 0.8,
        decision: { allowed: true, confidence: 0.8, reason: 'test', minimumRequired: 0.5 },
        firedAt: now,
      })

      expect(trail.size()).toBe(1)
    })

    it('retrieves recent entries', () => {
      const trail = new MemoryWriteAuditTrail()
      const now = new Date().toISOString()

      for (let i = 0; i < 5; i++) {
        trail.record({
          timestamp: now,
          key: `key_${i}`,
          value: `value_${i}`,
          proposedConfidence: 0.5 + i * 0.1,
          decision: { allowed: true, confidence: 0.5 + i * 0.1, reason: 'ok', minimumRequired: 0.5 },
          firedAt: now,
        })
      }

      const recent = trail.getRecent(3)
      expect(recent.length).toBe(3)
      expect(recent[0].key).toBe('key_2')
      expect(recent[2].key).toBe('key_4')
    })

    it('filters entries by key', () => {
      const trail = new MemoryWriteAuditTrail()
      const now = new Date().toISOString()

      for (let i = 0; i < 5; i++) {
        trail.record({
          timestamp: now,
          key: i % 2 === 0 ? 'target_key' : 'other_key',
          value: `value_${i}`,
          proposedConfidence: 0.8,
          decision: { allowed: true, confidence: 0.8, reason: 'ok', minimumRequired: 0.5 },
          firedAt: now,
        })
      }

      const targetEntries = trail.getByKey('target_key', 10)
      expect(targetEntries.length).toBe(3)
      expect(targetEntries.every(e => e.key === 'target_key')).toBe(true)
    })

    it('caps audit trail size to prevent memory bloat', () => {
      const trail = new MemoryWriteAuditTrail()
      const now = new Date().toISOString()

      // Add 1200 entries (exceeds default max of 1000)
      for (let i = 0; i < 1200; i++) {
        trail.record({
          timestamp: now,
          key: `key_${i}`,
          value: `value_${i}`,
          proposedConfidence: 0.8,
          decision: { allowed: true, confidence: 0.8, reason: 'ok', minimumRequired: 0.5 },
          firedAt: now,
        })
      }

      // Should still be capped at 1000
      expect(trail.size()).toBe(1000)
      
      // Should keep latest entries
      const recent = trail.getRecent(1)
      expect(recent[0].key).toBe('key_1199')
    })

    it('clears audit trail', () => {
      const trail = new MemoryWriteAuditTrail()
      const now = new Date().toISOString()

      trail.record({
        timestamp: now,
        key: 'test',
        value: 'data',
        proposedConfidence: 0.8,
        decision: { allowed: true, confidence: 0.8, reason: 'ok', minimumRequired: 0.5 },
        firedAt: now,
      })

      expect(trail.size()).toBe(1)
      trail.clear()
      expect(trail.size()).toBe(0)
    })

    it('distinguishes between allowed and rejected writes', () => {
      const trail = new MemoryWriteAuditTrail()
      const now = new Date().toISOString()

      trail.record({
        timestamp: now,
        key: 'allowed_write',
        value: 'high_conf',
        proposedConfidence: 0.9,
        decision: { allowed: true, confidence: 0.9, reason: 'ok', minimumRequired: 0.5 },
        firedAt: now,
      })

      trail.record({
        timestamp: now,
        key: 'rejected_write',
        value: 'low_conf',
        proposedConfidence: 0.2,
        decision: { allowed: false, confidence: 0.2, reason: 'insufficient', minimumRequired: 0.5 },
        firedAt: now,
      })

      const all = trail.getRecent(10)
      expect(all.length).toBe(2)
      expect(all[0].decision.allowed).toBe(true)
      expect(all[1].decision.allowed).toBe(false)
    })
  })
})
