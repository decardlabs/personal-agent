import { describe, expect, it } from 'vitest'
import { createTaskStateMachine } from './taskStateMachine.js'

describe('taskStateMachine', () => {
  it('supports standard happy path transitions', () => {
    const sm = createTaskStateMachine('pending')

    expect(sm.transitionTo('running')).toBe('running')
    expect(sm.transitionTo('completed')).toBe('completed')
    expect(sm.getCurrentState()).toBe('completed')
  })

  it('supports blocked to running recovery path', () => {
    const sm = createTaskStateMachine('pending')

    sm.transitionTo('running')
    sm.transitionTo('blocked')

    expect(sm.canTransitionTo('running')).toBe(true)
    expect(sm.transitionTo('running')).toBe('running')
  })

  it('rejects invalid transitions', () => {
    const sm = createTaskStateMachine('pending')

    expect(sm.canTransitionTo('completed')).toBe(false)
    expect(() => sm.transitionTo('completed')).toThrow(
      'Invalid task state transition: pending -> completed',
    )
  })

  it('keeps terminal states immutable', () => {
    const sm = createTaskStateMachine('pending')

    sm.transitionTo('running')
    sm.transitionTo('failed')

    expect(() => sm.transitionTo('running')).toThrow(
      'Invalid task state transition: failed -> running',
    )
  })
})
