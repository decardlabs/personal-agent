import type { Database } from 'better-sqlite3'

export type Preference = {
  userId: string
  key: string
  value: string
  updatedAt: string
}

export class PreferenceRepository {
  constructor(private readonly db: Database) {}

  set(userId: string, key: string, value: string): void {
    const now = new Date().toISOString()
    this.db
      .prepare(
        `INSERT INTO user_preferences (user_id, pref_key, pref_value_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(user_id, pref_key)
         DO UPDATE SET pref_value_json = excluded.pref_value_json, updated_at = excluded.updated_at`,
      )
      .run(userId, key, JSON.stringify(value), now)
  }

  get(userId: string, key: string): string | null {
    const row = this.db
      .prepare(
        `SELECT pref_value_json FROM user_preferences WHERE user_id = ? AND pref_key = ? LIMIT 1`,
      )
      .get(userId, key) as { pref_value_json: string } | undefined

    if (!row) {
      return null
    }
    return JSON.parse(row.pref_value_json) as string
  }

  listAll(userId: string): Array<{ key: string; value: string }> {
    const rows = this.db
      .prepare(
        `SELECT pref_key, pref_value_json FROM user_preferences WHERE user_id = ? ORDER BY pref_key`,
      )
      .all(userId) as Array<{ pref_key: string; pref_value_json: string }>

    return rows.map(row => ({
      key: row.pref_key,
      value: JSON.parse(row.pref_value_json) as string,
    }))
  }

  delete(userId: string, key: string): void {
    this.db
      .prepare(`DELETE FROM user_preferences WHERE user_id = ? AND pref_key = ?`)
      .run(userId, key)
  }
}
