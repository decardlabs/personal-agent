import type { SessionEventRepository } from '../storage/sessionEventRepository.js'
import type { ToolPermissionRepository } from '../storage/toolPermissionRepository.js'
import type { TaskCheckpointRepository } from '../storage/taskCheckpointRepository.js'
import type { MemoryCoordinator } from '../memory/memoryCoordinator.js'
import { executeSequentialTaskPlan } from './taskExecutor.js'
import { runTurn, type TurnOptions, type TurnResult } from './runTurn.js'
import type { TaskState } from './taskStateMachine.js'

export type ResumeTaskResult = {
  kind: 'resumed' | 'missing_checkpoint' | 'already_completed' | 'not_resumable'
  message: string
  checkpointStatus: TaskState | null
  resumedInput: string | null
  turnResult: TurnResult | null
}

export async function resumeTaskFromLatestCheckpoint(args: {
  taskId: string
  sessionId: string
  repository: SessionEventRepository
  taskCheckpointRepository: TaskCheckpointRepository
  memory: MemoryCoordinator
  permissionRepository: ToolPermissionRepository
  turnOptions: TurnOptions
}): Promise<ResumeTaskResult> {
  const latestCheckpoint = args.taskCheckpointRepository.getLatestCheckpoint(args.taskId)
  if (!latestCheckpoint) {
    return {
      kind: 'missing_checkpoint',
      message: `No checkpoints found for task '${args.taskId}'.`,
      checkpointStatus: null,
      resumedInput: null,
      turnResult: null,
    }
  }

  if (latestCheckpoint.status === 'completed') {
    return {
      kind: 'already_completed',
      message: `Task '${args.taskId}' is already completed.`,
      checkpointStatus: latestCheckpoint.status,
      resumedInput: null,
      turnResult: null,
    }
  }

  const payload = (
    latestCheckpoint.payload
    && typeof latestCheckpoint.payload === 'object'
  ) ? latestCheckpoint.payload as Record<string, unknown> : {}

  const resumeInput = typeof payload['normalizedInput'] === 'string'
    ? payload['normalizedInput']
    : null

  if (!resumeInput) {
    return {
      kind: 'not_resumable',
      message: `Task '${args.taskId}' latest checkpoint does not contain resumable input.`,
      checkpointStatus: latestCheckpoint.status,
      resumedInput: null,
      turnResult: null,
    }
  }

  const resumeOptions: TurnOptions = {
    ...args.turnOptions,
    taskId: args.taskId,
  }

  const remainingStepInputs = Array.isArray(payload['remainingStepInputs'])
    ? payload['remainingStepInputs'].filter(item => typeof item === 'string') as string[]
    : []

  if (remainingStepInputs.length > 1) {
    const resumedTask = await executeSequentialTaskPlan({
      plan: {
        taskId: args.taskId,
        mode: 'sequential',
        steps: remainingStepInputs.map((input, index) => ({
          id: `${args.taskId}:resume-step-${index + 1}`,
          input,
          dependsOn: index === 0 ? [] : [`${args.taskId}:resume-step-${index}`],
        })),
      },
      sessionId: args.sessionId,
      buildTurnOptions: () => resumeOptions,
      runStep: async (input, options) => runTurn(
        input,
        args.repository,
        args.memory,
        args.permissionRepository,
        args.sessionId,
        options,
      ),
      checkpointWriter: checkpoint => {
        args.taskCheckpointRepository.upsertTask(
          checkpoint.taskId,
          checkpoint.sessionId,
          checkpoint.status,
          checkpoint.createdAt,
        )
        args.taskCheckpointRepository.saveCheckpoint({
          taskId: checkpoint.taskId,
          status: checkpoint.status,
          stepIndex: checkpoint.stepIndex,
          payload: checkpoint.payload,
          createdAt: checkpoint.createdAt,
        })
      },
    })

    return {
      kind: 'resumed',
      message: [
        `Task '${args.taskId}' resumed from latest checkpoint.`,
        `- checkpoint status: ${latestCheckpoint.status}`,
        `- replayed input: ${remainingStepInputs[0]}`,
        `- result: ${resumedTask.status} (${resumedTask.completedSteps}/${resumedTask.totalSteps})`,
      ].join('\n'),
      checkpointStatus: latestCheckpoint.status,
      resumedInput: remainingStepInputs[0] ?? null,
      turnResult: null,
    }
  }

  const resumedTurn = await runTurn(
    resumeInput,
    args.repository,
    args.memory,
    args.permissionRepository,
    args.sessionId,
    resumeOptions,
  )

  return {
    kind: 'resumed',
    message: [
      `Task '${args.taskId}' resumed from latest checkpoint.`,
      `- checkpoint status: ${latestCheckpoint.status}`,
      `- replayed input: ${resumeInput}`,
      `- result: ${resumedTurn.response}`,
    ].join('\n'),
    checkpointStatus: latestCheckpoint.status,
    resumedInput: resumeInput,
    turnResult: resumedTurn,
  }
}