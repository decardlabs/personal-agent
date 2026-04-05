import type { SessionEventRepository } from '../storage/sessionEventRepository.js'
import type { ToolPermissionRepository } from '../storage/toolPermissionRepository.js'
import type { TaskCheckpointRepository } from '../storage/taskCheckpointRepository.js'
import type { MemoryCoordinator } from '../memory/memoryCoordinator.js'
import {
  executeSequentialTaskPlan,
  type TaskExecutionStepResult,
  type TaskSequenceCheckpointPayload,
} from './taskExecutor.js'
import type { TaskPlanStep, TaskStepCondition } from './taskPlan.js'
import { runTurn, type TurnOptions, type TurnResult } from './runTurn.js'
import type { TaskState } from './taskStateMachine.js'

export type ResumeTaskResult = {
  kind: 'resumed' | 'missing_checkpoint' | 'already_completed' | 'not_resumable'
  message: string
  checkpointStatus: TaskState | null
  resumedInput: string | null
  turnResult: TurnResult | null
}

function asSequencePayload(payload: unknown): TaskSequenceCheckpointPayload | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const candidate = payload as Record<string, unknown>
  const mode = candidate['mode']
  if (
    candidate['schema'] !== 'task_sequence.v1'
    || (mode !== 'sequential' && mode !== 'dependency_graph')
  ) {
    return null
  }

  return candidate as unknown as TaskSequenceCheckpointPayload
}

function extractPendingSteps(payload: TaskSequenceCheckpointPayload | null, taskId: string): TaskPlanStep[] {
  if (!payload || !Array.isArray(payload.pendingSteps) || payload.pendingSteps.length === 0) {
    return []
  }

  return payload.pendingSteps
    .filter(step => step && typeof step === 'object')
    .map((step, index) => {
      const candidate = step as {
        id?: string
        label?: string
        input?: string
        dependsOn?: string[]
        condition?: TaskStepCondition
      }
      return {
        id: typeof candidate.id === 'string' ? candidate.id : `${taskId}:resume-step-${index + 1}`,
        label: typeof candidate.label === 'string' ? candidate.label : `resume-step-${index + 1}`,
        input: typeof candidate.input === 'string' ? candidate.input : '',
        dependsOn: Array.isArray(candidate.dependsOn)
          ? candidate.dependsOn.filter(item => typeof item === 'string')
          : [],
        condition: candidate.condition,
      }
    })
    .filter(step => step.input.length > 0)
}

function extractCompletedStepResults(payload: TaskSequenceCheckpointPayload | null): TaskExecutionStepResult[] {
  if (!payload || !Array.isArray(payload.completedSteps) || payload.completedSteps.length === 0) {
    return []
  }

  return payload.completedSteps
    .filter(step => step && typeof step === 'object')
    .map((step, index) => {
      const candidate = step as {
        id?: string
        label?: string
        response?: string
        wasSkipped?: boolean
      }
      return {
        stepId: typeof candidate.id === 'string' ? candidate.id : `completed-step-${index + 1}`,
        label: typeof candidate.label === 'string' ? candidate.label : `completed-step-${index + 1}`,
        stepIndex: index + 1,
        inputTemplate: '(checkpoint snapshot)',
        input: '(checkpoint snapshot)',
        response: typeof candidate.response === 'string' ? candidate.response : '',
        status: 'completed' as const,
        wasSkipped: Boolean(candidate.wasSkipped),
      }
    })
    .filter(step => step.response.length > 0)
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
  const sequencePayload = asSequencePayload(latestCheckpoint.payload)

  const resumeInput = typeof sequencePayload?.normalizedInput === 'string'
    ? sequencePayload.normalizedInput
    : typeof payload['normalizedInput'] === 'string'
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

  const remainingStepInputs = Array.isArray(sequencePayload?.remainingStepInputs)
    ? sequencePayload.remainingStepInputs.filter(item => typeof item === 'string')
    : Array.isArray(payload['remainingStepInputs'])
      ? payload['remainingStepInputs'].filter(item => typeof item === 'string') as string[]
    : []
  const pendingSteps = extractPendingSteps(sequencePayload, args.taskId)
  const completedStepResults = extractCompletedStepResults(sequencePayload)

  if (pendingSteps.length > 0 || remainingStepInputs.length > 1) {
    const resumedSteps = pendingSteps.length > 0
      ? (() => {
        const pendingStepIds = new Set(pendingSteps.map(step => step.id))
        return pendingSteps.map(step => ({
          ...step,
          dependsOn: step.dependsOn.filter(dependencyId => pendingStepIds.has(dependencyId)),
        }))
      })()
      : remainingStepInputs.map((input, index) => ({
        id: `${args.taskId}:resume-step-${index + 1}`,
        label: `resume-step-${index + 1}`,
        input,
        dependsOn: index === 0 ? [] : [`${args.taskId}:resume-step-${index}`],
      }))
    const resumedTask = await executeSequentialTaskPlan({
      plan: {
        taskId: args.taskId,
        mode: pendingSteps.length > 0 && pendingSteps.some(step => step.dependsOn.length > 1)
          ? 'dependency_graph'
          : (sequencePayload?.mode ?? 'sequential'),
        steps: resumedSteps,
      },
      sessionId: args.sessionId,
      totalSteps: sequencePayload?.totalSteps ?? (completedStepResults.length + resumedSteps.length),
      initialCompletedSteps: completedStepResults,
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
        `- replayed input: ${resumedSteps[0]?.input ?? remainingStepInputs[0] ?? resumeInput}`,
        `- result: ${resumedTask.summary.status} (${resumedTask.summary.completedSteps}/${resumedTask.summary.totalSteps})`,
      ].join('\n'),
      checkpointStatus: latestCheckpoint.status,
      resumedInput: resumedSteps[0]?.input ?? remainingStepInputs[0] ?? null,
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