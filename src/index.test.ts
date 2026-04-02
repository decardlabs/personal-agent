import { describe, expect, it } from 'vitest'
import { transitionTo, getCurrentState } from './agent/stateMachine.js'

describe('state machine', () => {
  it('transitions to the requested state', () => {
    const next = transitionTo('reasoning')
    expect(next).toBe('reasoning')
    expect(getCurrentState()).toBe('reasoning')
  })
})
