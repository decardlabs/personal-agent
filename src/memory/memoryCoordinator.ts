import {
  getContextSnapshot,
  type ContextSnapshot,
} from './contextMemory.js'
import { PersistentMemoryStore } from './persistentMemory.js'
import { PreferenceStore } from './preferenceMemory.js'
import { SessionMemoryStore } from './sessionMemory.js'

export type LLMMemoryBundle = {
  context: ContextSnapshot
  preferences: Array<{ key: string; value: string }>
  history: ReturnType<SessionMemoryStore['getHistory']>
  persistentFacts: ReturnType<PersistentMemoryStore['listFacts']>
}

export type MemoryDiagnostics = {
  historyTurns: number
  preferenceCount: number
  persistentFactCount: number
}

export type MemoryCoordinator = {
  session: SessionMemoryStore
  persistent: PersistentMemoryStore
  preferences: PreferenceStore
  getContextSnapshot: () => ContextSnapshot & { preferences: Array<{ key: string; value: string }> }
  retrieveForLLM: (sessionId: string, options?: { historyLimit?: number; factLimit?: number; minFactConfidence?: number }) => LLMMemoryBundle
  getDiagnostics: (sessionId: string) => MemoryDiagnostics
}

export function createMemoryCoordinator(
  persistent: PersistentMemoryStore,
  preferences: PreferenceStore,
): MemoryCoordinator {
  const sessionStore = new SessionMemoryStore()

  return {
    session: sessionStore,
    persistent,
    preferences,
    getContextSnapshot: () => ({
      ...getContextSnapshot(),
      preferences: preferences.listAll(),
    }),
    retrieveForLLM: (sessionId, options) => {
      const historyLimit = options?.historyLimit ?? 10
      const factLimit = options?.factLimit ?? 10
      const minFactConfidence = options?.minFactConfidence ?? 0.4
      const actualHistory = sessionStore.getHistory(sessionId).slice(-historyLimit)

      return {
        context: getContextSnapshot(),
        preferences: preferences.listAll(),
        history: actualHistory,
        persistentFacts: persistent.listFacts(factLimit, minFactConfidence),
      }
    },
    getDiagnostics: sessionId => ({
      historyTurns: sessionStore.getHistory(sessionId).length,
      preferenceCount: preferences.listAll().length,
      persistentFactCount: persistent.listFacts(200, 0).length,
    }),
  }
}
