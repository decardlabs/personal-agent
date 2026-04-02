import {
  getContextSnapshot,
  type ContextSnapshot,
} from './contextMemory.js'
import { PersistentMemoryStore } from './persistentMemory.js'
import { SessionMemoryStore } from './sessionMemory.js'

export type MemoryCoordinator = {
  session: SessionMemoryStore
  persistent: PersistentMemoryStore
  getContextSnapshot: () => ContextSnapshot
}

export function createMemoryCoordinator(
  persistent: PersistentMemoryStore,
): MemoryCoordinator {
  return {
    session: new SessionMemoryStore(),
    persistent,
    getContextSnapshot,
  }
}
