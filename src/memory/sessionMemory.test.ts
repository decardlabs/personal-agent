import { describe, expect, it } from 'vitest'
import { SessionMemoryStore, type HistoryEntry } from './sessionMemory.js'

describe('SessionMemoryStore', () => {
  describe('history window enforcement', () => {
    it('stores entries up to window size limit', () => {
      const store = new SessionMemoryStore(5)
      for (let i = 0; i < 5; i++) {
        store.pushHistory('session-1', { input: `query-${i}`, response: `resp-${i}` })
      }

      const history = store.getHistory('session-1')
      expect(history.length).toBe(5)
      expect(history[0]).toEqual({ input: 'query-0', response: 'resp-0' })
      expect(history[4]).toEqual({ input: 'query-4', response: 'resp-4' })
    })

    it('evicts oldest entries when window is exceeded', () => {
      const store = new SessionMemoryStore(3)
      for (let i = 0; i < 5; i++) {
        store.pushHistory('session-1', { input: `query-${i}`, response: `resp-${i}` })
      }

      const history = store.getHistory('session-1')
      expect(history.length).toBe(3)
      // oldest entries (0, 1) should be evicted
      expect(history[0]).toEqual({ input: 'query-2', response: 'resp-2' })
      expect(history[1]).toEqual({ input: 'query-3', response: 'resp-3' })
      expect(history[2]).toEqual({ input: 'query-4', response: 'resp-4' })
    })

    it('maintains fifo order with large overflow', () => {
      const store = new SessionMemoryStore(2)
      for (let i = 0; i < 100; i++) {
        store.pushHistory('session-1', { input: `q-${i}`, response: `r-${i}` })
      }

      const history = store.getHistory('session-1')
      expect(history.length).toBe(2)
      expect(history[0]).toEqual({ input: 'q-98', response: 'r-98' })
      expect(history[1]).toEqual({ input: 'q-99', response: 'r-99' })
    })

    it('handles window size of 1', () => {
      const store = new SessionMemoryStore(1)
      store.pushHistory('session-1', { input: 'first', response: 'resp1' })
      store.pushHistory('session-1', { input: 'second', response: 'resp2' })

      const history = store.getHistory('session-1')
      expect(history.length).toBe(1)
      expect(history[0]).toEqual({ input: 'second', response: 'resp2' })
    })

    it('uses default window size when not specified', () => {
      const store = new SessionMemoryStore()
      for (let i = 0; i < 15; i++) {
        store.pushHistory('session-1', { input: `q-${i}`, response: `r-${i}` })
      }

      const history = store.getHistory('session-1')
      expect(history.length).toBe(10) // DEFAULT_HISTORY_WINDOW = 10
      expect(history[0]).toEqual({ input: 'q-5', response: 'r-5' })
      expect(history[9]).toEqual({ input: 'q-14', response: 'r-14' })
    })
  })

  describe('session isolation', () => {
    it('maintains separate histories per session', () => {
      const store = new SessionMemoryStore(3)
      store.pushHistory('session-1', { input: 'q1', response: 'r1' })
      store.pushHistory('session-1', { input: 'q2', response: 'r2' })
      store.pushHistory('session-2', { input: 'a1', response: 'b1' })

      expect(store.getHistory('session-1')).toEqual([
        { input: 'q1', response: 'r1' },
        { input: 'q2', response: 'r2' },
      ])
      expect(store.getHistory('session-2')).toEqual([{ input: 'a1', response: 'b1' }])
    })

    it('applies window enforcement per session independently', () => {
      const store = new SessionMemoryStore(2)
      for (let i = 0; i < 3; i++) {
        store.pushHistory('session-1', { input: `s1-q${i}`, response: `s1-r${i}` })
      }
      for (let i = 0; i < 5; i++) {
        store.pushHistory('session-2', { input: `s2-q${i}`, response: `s2-r${i}` })
      }

      const h1 = store.getHistory('session-1')
      const h2 = store.getHistory('session-2')

      expect(h1.length).toBe(2)
      expect(h1).toEqual([
        { input: 's1-q1', response: 's1-r1' },
        { input: 's1-q2', response: 's1-r2' },
      ])

      expect(h2.length).toBe(2)
      expect(h2).toEqual([
        { input: 's2-q3', response: 's2-r3' },
        { input: 's2-q4', response: 's2-r4' },
      ])
    })
  })

  describe('empty and edge state handling', () => {
    it('returns empty array for non-existent session', () => {
      const store = new SessionMemoryStore()
      expect(store.getHistory('non-existent')).toEqual([])
    })

    it('handles empty session with multiple queries', () => {
      const store = new SessionMemoryStore()
      const emptyHistory = store.getHistory('session-1')
      store.pushHistory('session-1', { input: 'first', response: 'resp' })
      const afterPush = store.getHistory('session-1')

      expect(emptyHistory).toEqual([])
      expect(afterPush).toEqual([{ input: 'first', response: 'resp' }])
    })

    it('returns getHistory array reference (can be mutated between calls)', () => {
      const store = new SessionMemoryStore(3)
      store.pushHistory('session-1', { input: 'q1', response: 'r1' })
      const history1 = store.getHistory('session-1')
      store.pushHistory('session-1', { input: 'q2', response: 'r2' })
      const history2 = store.getHistory('session-1')

      // Both references show the same data (array is mutated)
      expect(history1).toEqual([
        { input: 'q1', response: 'r1' },
        { input: 'q2', response: 'r2' },
      ])
      expect(history2).toEqual([
        { input: 'q1', response: 'r1' },
        { input: 'q2', response: 'r2' },
      ])
    })
  })

  describe('key-value storage', () => {
    it('stores and retrieves arbitrary key-value pairs', () => {
      const store = new SessionMemoryStore()
      store.set('session-1', 'theme', 'dark')
      store.set('session-1', 'lang', 'en')

      expect(store.get('session-1', 'theme')).toBe('dark')
      expect(store.get('session-1', 'lang')).toBe('en')
    })

    it('returns null for non-existent key', () => {
      const store = new SessionMemoryStore()
      store.set('session-1', 'theme', 'dark')
      expect(store.get('session-1', 'unknown')).toBeNull()
    })

    it('returns null for non-existent session', () => {
      const store = new SessionMemoryStore()
      expect(store.get('unknown-session', 'key')).toBeNull()
    })

    it('overwrites existing key values', () => {
      const store = new SessionMemoryStore()
      store.set('session-1', 'theme', 'dark')
      store.set('session-1', 'theme', 'light')

      expect(store.get('session-1', 'theme')).toBe('light')
    })

    it('maintains separate key-value storage per session', () => {
      const store = new SessionMemoryStore()
      store.set('session-1', 'theme', 'dark')
      store.set('session-2', 'theme', 'light')

      expect(store.get('session-1', 'theme')).toBe('dark')
      expect(store.get('session-2', 'theme')).toBe('light')
    })
  })
})
