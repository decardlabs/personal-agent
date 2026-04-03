import type Database from 'better-sqlite3'

type MemoryFactRow = {
  scope: string
  key: string
  value_json: string
  confidence: number
  updated_at: string
}

export class MemoryFactRepository {
  constructor(private readonly db: Database.Database) {}

  upsert(
    scope: string,
    key: string,
    value: unknown,
    confidence: number,
    updatedAt: string,
  ): void {
    this.db
      .prepare(
        `INSERT INTO memory_facts (scope, key, value_json, confidence, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(scope, key)
         DO UPDATE SET
           value_json = excluded.value_json,
           confidence = excluded.confidence,
           updated_at = excluded.updated_at`,
      )
      .run(scope, key, JSON.stringify(value), confidence, updatedAt)
  }

  get(scope: string, key: string): {
    scope: string
    key: string
    value: unknown
    confidence: number
    updatedAt: string
  } | null {
    const row = this.db
      .prepare(
        `SELECT scope, key, value_json, confidence, updated_at
         FROM memory_facts
         WHERE scope = ? AND key = ?
         LIMIT 1`,
      )
      .get(scope, key) as MemoryFactRow | undefined

    if (!row) {
      return null
    }

    return {
      scope: row.scope,
      key: row.key,
      value: JSON.parse(row.value_json),
      confidence: row.confidence,
      updatedAt: row.updated_at,
    }
  }

  listByScope(
    scope: string,
    limit = 20,
    minConfidence = 0,
  ): Array<{
    scope: string
    key: string
    value: unknown
    confidence: number
    updatedAt: string
  }> {
    const rows = this.db
      .prepare(
        `SELECT scope, key, value_json, confidence, updated_at
         FROM memory_facts
         WHERE scope = ? AND confidence >= ?
         ORDER BY confidence DESC, updated_at DESC
         LIMIT ?`,
      )
      .all(scope, minConfidence, limit) as MemoryFactRow[]

    return rows.map(row => ({
      scope: row.scope,
      key: row.key,
      value: JSON.parse(row.value_json),
      confidence: row.confidence,
      updatedAt: row.updated_at,
    }))
  }

  delete(scope: string, key: string): void {
    this.db
      .prepare(`DELETE FROM memory_facts WHERE scope = ? AND key = ?`)
      .run(scope, key)
  }

  pruneLowConfidenceBefore(
    scope: string,
    minConfidenceToKeep: number,
    cutoffIso: string,
    keepKeys: string[] = [],
  ): number {
    if (keepKeys.length === 0) {
      const result = this.db
        .prepare(
          `DELETE FROM memory_facts
           WHERE scope = ?
             AND confidence < ?
             AND updated_at < ?`,
        )
        .run(scope, minConfidenceToKeep, cutoffIso)
      return result.changes
    }

    const placeholders = keepKeys.map(() => '?').join(', ')
    const result = this.db
      .prepare(
        `DELETE FROM memory_facts
         WHERE scope = ?
           AND confidence < ?
           AND updated_at < ?
           AND key NOT IN (${placeholders})`,
      )
      .run(scope, minConfidenceToKeep, cutoffIso, ...keepKeys)

    return result.changes
  }
}
