import { describe, expect, it } from 'vitest'
import { initializeDatabase } from '../storage/db.js'
import { applyMigrations } from '../storage/migrate.js'
import { SessionEventRepository } from '../storage/sessionEventRepository.js'
import { TaskCheckpointRepository } from '../storage/taskCheckpointRepository.js'
import { ToolPermissionRepository } from '../storage/toolPermissionRepository.js'
import { MemoryFactRepository } from '../storage/memoryFactRepository.js'
import { PreferenceRepository } from '../storage/preferenceRepository.js'
import { PersistentMemoryStore } from '../memory/persistentMemory.js'
import { PreferenceStore } from '../memory/preferenceMemory.js'
import { createMemoryCoordinator } from '../memory/memoryCoordinator.js'
import { resumeTaskFromLatestCheckpoint } from './taskResume.js'

describe('taskResume', () => {
  it('resumes a structured sequential checkpoint using remaining step inputs', async () => {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    const eventRepository = new SessionEventRepository(db)
    const taskCheckpointRepository = new TaskCheckpointRepository(db)
    const permissionRepository = new ToolPermissionRepository(db)
    const memory = createMemoryCoordinator(
      new PersistentMemoryStore(new MemoryFactRepository(db)),
      new PreferenceStore(new PreferenceRepository(db)),
    )

    taskCheckpointRepository.upsertTask(
      'task-resume-1',
      'session-resume-1',
      'timeout',
      '2026-04-05T00:00:00.000Z',
    )
    taskCheckpointRepository.saveCheckpoint({
      taskId: 'task-resume-1',
      status: 'timeout',
      stepIndex: 1,
      payload: {
        schema: 'task_sequence.v1',
        mode: 'sequential',
        phase: 'step_result',
        totalSteps: 2,
        currentStepId: 'task-resume-1:step-1',
        currentStepIndex: 0,
        normalizedInput: 'echo alpha',
        remainingStepInputs: ['echo beta', 'echo gamma'],
        completedStepIds: ['task-resume-1:step-1'],
        lastResponse: 'Turn cancelled: tool execution timed out.',
      },
      createdAt: '2026-04-05T00:00:00.000Z',
    })

    const result = await resumeTaskFromLatestCheckpoint({
      taskId: 'task-resume-1',
      sessionId: 'session-resume-1',
      repository: eventRepository,
      taskCheckpointRepository,
      memory,
      permissionRepository,
      turnOptions: {
        echoToolRunner: args => ({ output: args.content }),
      },
    })

    expect(result.kind).toBe('resumed')
    expect(result.resumedInput).toBe('echo beta')
    expect(result.message).toContain('result: completed (2/2)')
  })
})
