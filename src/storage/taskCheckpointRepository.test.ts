import { describe, expect, it } from 'vitest'
import { initializeDatabase } from './db.js'
import { applyMigrations } from './migrate.js'
import { TaskCheckpointRepository } from './taskCheckpointRepository.js'

describe('TaskCheckpointRepository', () => {
  function makeRepo() {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    return new TaskCheckpointRepository(db)
  }

  it('upserts task status and latest timestamp', () => {
    const repo = makeRepo()
    const taskId = 'task-1'

    repo.upsertTask(taskId, 'session-1', 'pending', '2026-04-04T00:00:00.000Z')
    repo.upsertTask(taskId, 'session-1', 'running', '2026-04-04T00:01:00.000Z')

    repo.saveCheckpoint({
      taskId,
      status: 'running',
      stepIndex: 1,
      payload: { step: 'collect_context' },
      createdAt: '2026-04-04T00:01:00.000Z',
    })

    const latest = repo.getLatestCheckpoint(taskId)
    expect(latest?.status).toBe('running')
    expect(latest?.stepIndex).toBe(1)
    expect(latest?.payload).toEqual({ step: 'collect_context' })
  })

  it('returns checkpoints in reverse chronological order', () => {
    const repo = makeRepo()
    const taskId = 'task-2'

    repo.upsertTask(taskId, 'session-2', 'running', '2026-04-04T00:00:00.000Z')
    repo.saveCheckpoint({
      taskId,
      status: 'running',
      stepIndex: 1,
      payload: { note: 'step-1' },
      createdAt: '2026-04-04T00:00:01.000Z',
    })
    repo.saveCheckpoint({
      taskId,
      status: 'paused',
      stepIndex: 2,
      payload: { note: 'step-2' },
      createdAt: '2026-04-04T00:00:02.000Z',
    })

    const checkpoints = repo.listCheckpoints(taskId)
    expect(checkpoints).toHaveLength(2)
    expect(checkpoints[0]?.status).toBe('paused')
    expect(checkpoints[1]?.status).toBe('running')
  })

  it('returns null when checkpoint does not exist', () => {
    const repo = makeRepo()
    expect(repo.getLatestCheckpoint('missing-task')).toBeNull()
  })

  it('lists tasks by session in latest-first order', () => {
    const repo = makeRepo()

    repo.upsertTask('task-a', 'session-a', 'running', '2026-04-04T00:00:01.000Z')
    repo.upsertTask('task-b', 'session-a', 'completed', '2026-04-04T00:00:03.000Z')
    repo.upsertTask('task-c', 'session-a', 'failed', '2026-04-04T00:00:02.000Z')
    repo.upsertTask('task-other', 'session-b', 'running', '2026-04-04T00:00:04.000Z')

    const tasks = repo.listTasksBySession('session-a')
    expect(tasks.map(task => task.taskId)).toEqual(['task-b', 'task-c', 'task-a'])
  })

  it('returns latest task for session', () => {
    const repo = makeRepo()

    repo.upsertTask('task-old', 'session-latest', 'running', '2026-04-04T00:00:01.000Z')
    repo.upsertTask('task-new', 'session-latest', 'completed', '2026-04-04T00:00:05.000Z')

    const latest = repo.getLatestTaskBySession('session-latest')
    expect(latest?.taskId).toBe('task-new')
    expect(latest?.status).toBe('completed')
  })
})
