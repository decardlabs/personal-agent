import { describe, expect, it } from 'vitest'
import { createStateMachine } from './agent/stateMachine.js'

describe('state machine', () => {
  it('transitions to the requested state', () => {
    const sm = createStateMachine()
    const next = sm.transitionTo('reasoning')
    expect(next).toBe('reasoning')
    expect(sm.getCurrentState()).toBe('reasoning')
  })
})
