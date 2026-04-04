import {
  getContextSnapshot,
  type ContextSnapshot,
} from './contextMemory.js'
import { PersistentMemoryStore } from './persistentMemory.js'
import { PreferenceStore } from './preferenceMemory.js'
import { SessionMemoryStore } from './sessionMemory.js'
import { createMemoryWritePolicy, MemoryWriteAuditTrail, shouldBypassConfidenceCheck, type WriteDecisionResult } from './memoryWritePolicy.js'

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
  // Write-decision observability
  writeDecisionsTotal: number
  writeDecisionsAllowed: number
  writeDecisionsRejected: number
  writeDecisionAcceptanceRate: number
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

export type LLMContextBundle = {
  context: ContextSnapshot
  preferences: Array<{ key: string; value: string }>
  history: ReturnType<SessionMemoryStore['getHistory']>
  persistentFacts: ReturnType<PersistentMemoryStore['listRankedFacts']>
}

export type MemoryCoordinator = {
  session: SessionMemoryStore
  persistent: PersistentMemoryStore
  preferences: PreferenceStore
  getContextSnapshot: () => ContextSnapshot & { preferences: Array<{ key: string; value: string }> }
  retrieveForLLM: (sessionId: string, options?: { historyLimit?: number; factLimit?: number; minFactConfidence?: number }) => LLMMemoryBundle
  buildLLMContextBundle: (sessionId: string, options?: { historyLimit?: number; factLimit?: number; minFactConfidence?: number }) => LLMContextBundle
  evaluatePersistentWrite: (key: string, value: string, proposedConfidence: number) => WriteDecisionResult
  getDiagnostics: (sessionId: string) => MemoryDiagnostics
  maybeAutoConsolidate: (sessionId: string, config: AutoConsolidationConfig) => AutoConsolidationResult
  getWriteAuditTrail: () => MemoryWriteAuditTrail
}

export function createMemoryCoordinator(
  persistent: PersistentMemoryStore,
  preferences: PreferenceStore,
): MemoryCoordinator {
  const sessionStore = new SessionMemoryStore()
  const writePolicy = createMemoryWritePolicy()
  const writeAuditTrail = new MemoryWriteAuditTrail()

  return {
    session: sessionStore,
    persistent,
    preferences,
    getContextSnapshot: () => ({
      ...getContextSnapshot(),
      preferences: preferences.listAll(),
    }),
    evaluatePersistentWrite: (key, value, proposedConfidence) => {
      // Bypass confidence checks for bookkeeping keys
      if (shouldBypassConfidenceCheck(key)) {
        return {
          allowed: true,
          confidence: proposedConfidence,
          reason: 'bookkeeping_key_always_allowed',
          minimumRequired: 0,
        }
      }

      const decision = writePolicy.evaluateWrite(key, value, proposedConfidence)

      // Record in audit trail
      writeAuditTrail.record({
        timestamp: new Date().toISOString(),
        key,
        value,
        proposedConfidence,
        decision,
        firedAt: new Date().toISOString(),
      })

      return decision
    },
    retrieveForLLM: (sessionId, options) => {
      const historyLimit = options?.historyLimit ?? 10
      const factLimit = options?.factLimit ?? 10
      const minFactConfidence = options?.minFactConfidence ?? 0.4
      const fullHistory = sessionStore.getHistory(sessionId)
      // Handle edge case: historyLimit=0 means no history, slice(-0) returns full array
      const actualHistory = historyLimit === 0 ? [] : fullHistory.slice(-historyLimit)

      return {
        context: getContextSnapshot(),
        preferences: preferences.listAll(),
        history: actualHistory,
        persistentFacts: persistent.listRankedFacts(factLimit, minFactConfidence),
      }
    },
    buildLLMContextBundle: (sessionId, options) => {
      const historyLimit = options?.historyLimit ?? 10
      const factLimit = options?.factLimit ?? 10
      const minFactConfidence = options?.minFactConfidence ?? 0.4
      const fullHistory = sessionStore.getHistory(sessionId)
      // Handle edge case: historyLimit=0 means no history, slice(-0) returns full array
      const actualHistory = historyLimit === 0 ? [] : fullHistory.slice(-historyLimit)

      return {
        context: getContextSnapshot(),
        preferences: preferences.listAll(),
        history: actualHistory,
        persistentFacts: persistent.listRankedFacts(factLimit, minFactConfidence),
      }
    },
    getDiagnostics: sessionId => {
      const health = persistent.getHealthSnapshot()
      
      // Calculate write-decision statistics
      const auditTrail = writeAuditTrail.getRecent(writeAuditTrail.size())
      const writeDecisionsTotal = auditTrail.length
      const writeDecisionsAllowed = auditTrail.filter(e => e.decision.allowed).length
      const writeDecisionsRejected = auditTrail.filter(e => !e.decision.allowed).length
      const writeDecisionAcceptanceRate = writeDecisionsTotal > 0
        ? writeDecisionsAllowed / writeDecisionsTotal
        : 1 // No decisions yet: consider as perfect (1.0)
      
      return {
        historyTurns: sessionStore.getHistory(sessionId).length,
        preferenceCount: preferences.listAll().length,
        persistentFactCount: health.totalFacts,
        staleFactCount: health.staleFacts,
        lowConfidenceFactCount: health.lowConfidenceFacts,
        averageFactConfidence: health.averageConfidence,
        recommendedAction: health.recommendedAction,
        writeDecisionsTotal,
        writeDecisionsAllowed,
        writeDecisionsRejected,
        writeDecisionAcceptanceRate,
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
    getWriteAuditTrail: () => writeAuditTrail,
  }
}
