import { initializeDatabase } from '../storage/db.js'
import { applyMigrations } from '../storage/migrate.js'
import { SessionEventRepository } from '../storage/sessionEventRepository.js'
import { MemoryFactRepository } from '../storage/memoryFactRepository.js'
import { PersistentMemoryStore } from '../memory/persistentMemory.js'
import { createMemoryCoordinator } from '../memory/memoryCoordinator.js'
import { ToolPermissionRepository } from '../storage/toolPermissionRepository.js'
import { runTurn } from '../agent/runTurn.js'
import type { TurnEvent, TurnEventType } from '../agent/types.js'
import type { ReplayCase } from './replayCases.js'

export type ReplayStepResult = {
  response: string
  events: TurnEvent[]
}

export type ReplayCaseResult = {
  caseName: string
  stepResults: ReplayStepResult[]
}

export function runReplayCase(testCase: ReplayCase): ReplayCaseResult {
  const db = initializeDatabase(':memory:')
  applyMigrations(db)

  const eventRepository = new SessionEventRepository(db)
  const memoryRepository = new MemoryFactRepository(db)
  const permissionRepository = new ToolPermissionRepository(db)
  const memory = createMemoryCoordinator(new PersistentMemoryStore(memoryRepository))

  const stepResults: ReplayStepResult[] = []

  for (const step of testCase.steps) {
    const turn = runTurn(
      step.input,
      eventRepository,
      memory,
      permissionRepository,
      testCase.sessionId,
      {
        approveRisky: step.approveRisky ?? false,
      },
    )

    stepResults.push({
      response: turn.response,
      events: eventRepository.listByTurn(turn.sessionId, turn.turnId),
    })
  }

  return {
    caseName: testCase.name,
    stepResults,
  }
}

export function extractEventTypes(events: TurnEvent[]): TurnEventType[] {
  return events.map(event => event.eventType)
}
