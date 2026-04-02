import type Database from 'better-sqlite3'
import type { TurnEvent } from '../agent/types.js'

export class SessionEventRepository {
  constructor(private readonly db: Database.Database) {}

  save(event: TurnEvent): void {
    this.db
      .prepare(
        `INSERT INTO session_events (session_id, turn_id, event_type, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        event.sessionId,
        event.turnId,
        event.eventType,
        JSON.stringify(event.payload),
        event.createdAt,
      )
  }
}
