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
  staleFactCount: number
  lowConfidenceFactCount: number
  averageFactConfidence: number
  recommendedAction: 'ok' | 'review' | 'consolidate'
}

export type AutoConsolidationConfig = {
  enabled: boolean
  minTurns: number
  minHoursSinceLastConsolidation: number
  minStaleFacts: number
  minLowConfidenceFacts: number
}

export type AutoConsolidationResult = {
  triggered: boolean
  removedCount: number
  reason: string
}

export type MemoryCoordinator = {
  session: SessionMemoryStore
  persistent: PersistentMemoryStore
  preferences: PreferenceStore
  getContextSnapshot: () => ContextSnapshot & { preferences: Array<{ key: string; value: string }> }
  retrieveForLLM: (sessionId: string, options?: { historyLimit?: number; factLimit?: number; minFactConfidence?: number }) => LLMMemoryBundle
  getDiagnostics: (sessionId: string) => MemoryDiagnostics
  maybeAutoConsolidate: (sessionId: string, config: AutoConsolidationConfig) => AutoConsolidationResult
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
        persistentFacts: persistent.listRankedFacts(factLimit, minFactConfidence),
      }
    },
    getDiagnostics: sessionId => {
      const health = persistent.getHealthSnapshot()
      return {
        historyTurns: sessionStore.getHistory(sessionId).length,
        preferenceCount: preferences.listAll().length,
        persistentFactCount: health.totalFacts,
        staleFactCount: health.staleFacts,
        lowConfidenceFactCount: health.lowConfidenceFacts,
        averageFactConfidence: health.averageConfidence,
        recommendedAction: health.recommendedAction,
      }
    },
    maybeAutoConsolidate: (sessionId, config) => {
      if (!config.enabled) {
        return { triggered: false, removedCount: 0, reason: 'disabled' }
      }

      const historyTurns = sessionStore.getHistory(sessionId).length
      if (historyTurns < config.minTurns) {
        return {
          triggered: false,
          removedCount: 0,
          reason: `insufficient_turns:${historyTurns}<${config.minTurns}`,
        }
      }

      const lastConsolidation = persistent.get('__last_consolidated_at')
      if (lastConsolidation) {
        const elapsedMs = Date.now() - Date.parse(lastConsolidation)
        const requiredMs = config.minHoursSinceLastConsolidation * 60 * 60 * 1000
        if (Number.isFinite(elapsedMs) && elapsedMs < requiredMs) {
          return {
            triggered: false,
            removedCount: 0,
            reason: `too_soon:${elapsedMs}<${requiredMs}`,
          }
        }
      }

      const health = persistent.getHealthSnapshot()
      if (
        health.staleFacts < config.minStaleFacts
        && health.lowConfidenceFacts < config.minLowConfidenceFacts
      ) {
        return {
          triggered: false,
          removedCount: 0,
          reason: 'health_threshold_not_met',
        }
      }

      const consolidationResult = persistent.consolidate()
      persistent.set('__last_consolidated_at', new Date().toISOString(), 1)
      return {
        triggered: true,
        removedCount: consolidationResult.removedCount,
        reason: 'triggered',
      }
    },
  }
}
