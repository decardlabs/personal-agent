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

export class PersistentMemoryStore {
  constructor(private readonly repository: MemoryFactRepository) {}

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
