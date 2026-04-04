import type Database from 'better-sqlite3'
import type { TaskState } from '../agent/taskStateMachine.js'

export type TaskCheckpoint = {
  taskId: string
  status: TaskState
  stepIndex: number
  payload: unknown
  createdAt: string
}

export type TaskRecord = {
  taskId: string
  sessionId: string
  status: TaskState
  updatedAt: string
}

type TaskCheckpointRow = {
  task_id: string
  status: TaskState
  step_index: number
  payload_json: string
  created_at: string
}

type TaskRow = {
  task_id: string
  session_id: string
  status: TaskState
  updated_at: string
}

export class TaskCheckpointRepository {
  constructor(private readonly db: Database.Database) {}

  upsertTask(taskId: string, sessionId: string, status: TaskState, updatedAt: string): void {
    this.db
      .prepare(
        `INSERT INTO tasks (task_id, session_id, status, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(task_id)
         DO UPDATE SET
           session_id = excluded.session_id,
           status = excluded.status,
           updated_at = excluded.updated_at`,
      )
      .run(taskId, sessionId, status, updatedAt)
  }

  saveCheckpoint(checkpoint: TaskCheckpoint): void {
    this.db
      .prepare(
        `INSERT INTO task_checkpoints (task_id, status, step_index, payload_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        checkpoint.taskId,
        checkpoint.status,
        checkpoint.stepIndex,
        JSON.stringify(checkpoint.payload),
        checkpoint.createdAt,
      )
  }

  getLatestCheckpoint(taskId: string): TaskCheckpoint | null {
    const row = this.db
      .prepare(
        `SELECT task_id, status, step_index, payload_json, created_at
         FROM task_checkpoints
         WHERE task_id = ?
         ORDER BY created_at DESC
         LIMIT 1`,
      )
      .get(taskId) as TaskCheckpointRow | undefined

    if (!row) {
      return null
    }

    return {
      taskId: row.task_id,
      status: row.status,
      stepIndex: row.step_index,
      payload: JSON.parse(row.payload_json),
      createdAt: row.created_at,
    }
  }

  listCheckpoints(taskId: string, limit = 20): TaskCheckpoint[] {
    const rows = this.db
      .prepare(
        `SELECT task_id, status, step_index, payload_json, created_at
         FROM task_checkpoints
         WHERE task_id = ?
         ORDER BY created_at DESC
         LIMIT ?`,
      )
      .all(taskId, limit) as TaskCheckpointRow[]

    return rows.map(row => ({
      taskId: row.task_id,
      status: row.status,
      stepIndex: row.step_index,
      payload: JSON.parse(row.payload_json),
      createdAt: row.created_at,
    }))
  }

  listTasksBySession(sessionId: string, limit = 10): TaskRecord[] {
    const rows = this.db
      .prepare(
        `SELECT task_id, session_id, status, updated_at
         FROM tasks
         WHERE session_id = ?
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(sessionId, limit) as TaskRow[]

    return rows.map(row => ({
      taskId: row.task_id,
      sessionId: row.session_id,
      status: row.status,
      updatedAt: row.updated_at,
    }))
  }

  getLatestTaskBySession(sessionId: string): TaskRecord | null {
    const row = this.db
      .prepare(
        `SELECT task_id, session_id, status, updated_at
         FROM tasks
         WHERE session_id = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(sessionId) as TaskRow | undefined

    if (!row) {
      return null
    }

    return {
      taskId: row.task_id,
      sessionId: row.session_id,
      status: row.status,
      updatedAt: row.updated_at,
    }
  }
}
