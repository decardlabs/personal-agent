import { describe, expect, it } from 'vitest'
import { initializeDatabase } from '../storage/db.js'
import { applyMigrations } from '../storage/migrate.js'
import { SessionEventRepository } from '../storage/sessionEventRepository.js'
import { runTurn } from './runTurn.js'
import { getCurrentState } from './stateMachine.js'

describe('runTurn', () => {
  it('runs echo flow and persists events in order', () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const repository = new SessionEventRepository(db)

    const result = runTurn('echo hello', repository, 'session-1')
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

    const result = runTurn('what can you do', repository, 'session-2')
    const events = repository.listByTurn(result.sessionId, result.turnId)

    expect(result.response).toContain('I can run echo only in this MVP')
    expect(events.map(event => event.eventType)).toEqual([
      'input_normalized',
      'reasoning_started',
      'turn_completed',
    ])
  })
})
