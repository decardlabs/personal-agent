import type Database from 'better-sqlite3'
import type { TurnEvent } from '../agent/types.js'

type SessionEventRow = {
  session_id: string
  turn_id: string
  event_type: TurnEvent['eventType']
  payload_json: string
  created_at: string
}

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

  listByTurn(sessionId: string, turnId: string): TurnEvent[] {
    const rows = this.db
      .prepare(
        `SELECT session_id, turn_id, event_type, payload_json, created_at
         FROM session_events
         WHERE session_id = ? AND turn_id = ?
         ORDER BY id ASC`,
      )
      .all(sessionId, turnId) as SessionEventRow[]

    return rows.map(row => ({
      sessionId: row.session_id,
      turnId: row.turn_id,
      eventType: row.event_type,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      createdAt: row.created_at,
    }))
  }

  listBySession(sessionId: string, limit = 200): TurnEvent[] {
    const rows = this.db
      .prepare(
        `SELECT session_id, turn_id, event_type, payload_json, created_at
         FROM session_events
         WHERE session_id = ?
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(sessionId, limit) as SessionEventRow[]

    return rows.map(row => ({
      sessionId: row.session_id,
      turnId: row.turn_id,
      eventType: row.event_type,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      createdAt: row.created_at,
    }))
  }

  countDistinctSessions(): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(DISTINCT session_id) AS count
         FROM session_events`,
      )
      .get() as { count: number }

    return row.count
  }

  listRecentTurnCompleted(limit = 20): TurnEvent[] {
    const rows = this.db
      .prepare(
        `SELECT session_id, turn_id, event_type, payload_json, created_at
         FROM session_events
         WHERE event_type = 'turn_completed'
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(limit) as SessionEventRow[]

    return rows.map(row => ({
      sessionId: row.session_id,
      turnId: row.turn_id,
      eventType: row.event_type,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      createdAt: row.created_at,
    }))
  }

  listMemoryDreamEvents(limit = 500): TurnEvent[] {
    const rows = this.db
      .prepare(
        `SELECT session_id, turn_id, event_type, payload_json, created_at
         FROM session_events
         WHERE event_type IN ('memory_dream_completed', 'memory_dream_skipped')
         ORDER BY id DESC
         LIMIT ?`,
      )
      .all(limit) as SessionEventRow[]

    return rows.map(row => ({
      sessionId: row.session_id,
      turnId: row.turn_id,
      eventType: row.event_type,
      payload: JSON.parse(row.payload_json) as Record<string, unknown>,
      createdAt: row.created_at,
    }))
  }
}
