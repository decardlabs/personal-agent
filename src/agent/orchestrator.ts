import { randomUUID } from 'node:crypto'
import { transitionTo } from './stateMachine.js'
import type { TurnEvent } from './types.js'

export function createTurnStartEvent(input: string): TurnEvent {
  transitionTo('normalizing_input')
  return {
    sessionId: randomUUID(),
    turnId: randomUUID(),
    eventType: 'input_normalized',
    payload: { input },
    createdAt: new Date().toISOString(),
  }
}
