import { MemoryFactRepository } from '../storage/memoryFactRepository.js'

const DEFAULT_SCOPE = 'persistent'

export type PersistentFact = {
  key: string
  value: string
  confidence: number
  updatedAt: string
}

export type ConsolidateOptions = {
  minConfidenceToKeep?: number
  maxAgeDays?: number
  keepKeys?: string[]
}

export type MemoryHealthSnapshot = {
  totalFacts: number
  staleFacts: number
  lowConfidenceFacts: number
  averageConfidence: number
  recommendedAction: 'ok' | 'review' | 'consolidate'
}

export class PersistentMemoryStore {
  constructor(private readonly repository: MemoryFactRepository) {}

  private computeRecencyScore(updatedAt: string): number {
    const updatedTs = Date.parse(updatedAt)
    if (!Number.isFinite(updatedTs)) {
      return 0
    }

    const ageDays = Math.max(0, (Date.now() - updatedTs) / (24 * 60 * 60 * 1000))
    return Math.exp(-ageDays / 30)
  }

  get(key: string): string | null {
    const row = this.repository.get(DEFAULT_SCOPE, key)
    if (!row) {
      return null
    }

    return typeof row.value === 'string' ? row.value : JSON.stringify(row.value)
  }

  set(key: string, value: string, confidence = 1): void {
    this.repository.upsert(
      DEFAULT_SCOPE,
      key,
      value,
      confidence,
      new Date().toISOString(),
    )
  }

  listFacts(limit = 20, minConfidence = 0): PersistentFact[] {
    return this.repository
      .listByScope(DEFAULT_SCOPE, limit, minConfidence)
      .map(row => ({
        key: row.key,
        value: typeof row.value === 'string' ? row.value : JSON.stringify(row.value),
        confidence: row.confidence,
        updatedAt: row.updatedAt,
      }))
  }

  listRankedFacts(limit = 20, minConfidence = 0): PersistentFact[] {
    const rows = this.repository
      .listByScope(DEFAULT_SCOPE, 500, minConfidence)
      .map(row => ({
        key: row.key,
        value: typeof row.value === 'string' ? row.value : JSON.stringify(row.value),
        confidence: row.confidence,
        updatedAt: row.updatedAt,
      }))

    return rows
      .sort((a, b) => {
        const scoreA = a.confidence * 0.7 + this.computeRecencyScore(a.updatedAt) * 0.3
        const scoreB = b.confidence * 0.7 + this.computeRecencyScore(b.updatedAt) * 0.3
        return scoreB - scoreA
      })
      .slice(0, limit)
  }

  getHealthSnapshot(): MemoryHealthSnapshot {
    const facts = this.listFacts(500, 0)
    if (facts.length === 0) {
      return {
        totalFacts: 0,
        staleFacts: 0,
        lowConfidenceFacts: 0,
        averageConfidence: 0,
        recommendedAction: 'ok',
      }
    }

    const staleCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
    const staleFacts = facts.filter(fact => {
      const ts = Date.parse(fact.updatedAt)
      return Number.isFinite(ts) && ts < staleCutoff
    }).length
    const lowConfidenceFacts = facts.filter(fact => fact.confidence < 0.5).length
    const averageConfidence = facts.reduce((sum, fact) => sum + fact.confidence, 0) / facts.length

    let recommendedAction: 'ok' | 'review' | 'consolidate' = 'ok'
    if (staleFacts >= 5 || lowConfidenceFacts >= 8) {
      recommendedAction = 'consolidate'
    } else if (staleFacts > 0 || lowConfidenceFacts > 0 || averageConfidence < 0.65) {
      recommendedAction = 'review'
    }

    return {
      totalFacts: facts.length,
      staleFacts,
      lowConfidenceFacts,
      averageConfidence,
      recommendedAction,
    }
  }

  consolidate(options: ConsolidateOptions = {}): { removedCount: number } {
    const minConfidenceToKeep = options.minConfidenceToKeep ?? 0.5
    const maxAgeDays = options.maxAgeDays ?? 30
    const keepKeys = options.keepKeys ?? ['last_echo_output']

    const cutoffTs = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000
    const cutoffIso = new Date(cutoffTs).toISOString()
    const removedCount = this.repository.pruneLowConfidenceBefore(
      DEFAULT_SCOPE,
      minConfidenceToKeep,
      cutoffIso,
      keepKeys,
    )

    return { removedCount }
  }
}
