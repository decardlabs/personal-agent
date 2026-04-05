import type { TurnOptions, TurnResult } from './runTurn.js'
import type { TaskPlan } from './taskPlan.js'
import type { TaskState } from './taskStateMachine.js'

export type TaskSequenceCheckpointPhase =
  | 'task_pending'
  | 'step_running'
  | 'step_result'
  | 'task_completed'

export type TaskExecutionCheckpointWriter = (checkpoint: {
  taskId: string
  sessionId: string
  status: TaskState
  stepIndex: number
  payload: TaskSequenceCheckpointPayload
  createdAt: string
}) => void

export type TaskExecutionStepResult = {
  stepId: string
  stepIndex: number
  input: string
  response: string
  status: TaskState
}

export type TaskExecutionSummary = {
  schema: 'task_execution_result.v1'
  taskId: string
  mode: 'sequential'
  status: TaskState
  completedSteps: number
  totalSteps: number
}

export type TaskExecutionResult = {
  summary: TaskExecutionSummary
  stepResults: TaskExecutionStepResult[]
}

export type TaskSequenceCheckpointPayload = {
  schema: 'task_sequence.v1'
  mode: 'sequential'
  phase: TaskSequenceCheckpointPhase
  totalSteps: number
  currentStepId: string | null
  currentStepIndex: number | null
  normalizedInput: string | null
  remainingStepInputs: string[]
  completedStepIds: string[]
  lastResponse: string | null
}

function classifyResponseStatus(response: string): TaskState {
  if (response.startsWith('Permission required')) {
    return 'blocked'
  }
  if (response.startsWith('Turn cancelled')) {
    return 'timeout'
  }
  if (response.startsWith('Tool execution failed')) {
    return 'failed'
  }
  return 'completed'
}

function isTerminalFailure(status: TaskState): boolean {
  return status === 'blocked' || status === 'timeout' || status === 'failed' || status === 'cancelled'
}

function createSequencePayload(args: {
  phase: TaskSequenceCheckpointPhase
  totalSteps: number
  currentStepId: string | null
  currentStepIndex: number | null
  normalizedInput: string | null
  remainingStepInputs: string[]
  completedStepIds: string[]
  lastResponse?: string | null
}): TaskSequenceCheckpointPayload {
  return {
    schema: 'task_sequence.v1',
    mode: 'sequential',
    phase: args.phase,
    totalSteps: args.totalSteps,
    currentStepId: args.currentStepId,
    currentStepIndex: args.currentStepIndex,
    normalizedInput: args.normalizedInput,
    remainingStepInputs: args.remainingStepInputs,
    completedStepIds: args.completedStepIds,
    lastResponse: args.lastResponse ?? null,
  }
}

function buildTaskExecutionResult(
  plan: TaskPlan,
  status: TaskState,
  stepResults: TaskExecutionStepResult[],
): TaskExecutionResult {
  const completedSteps = stepResults.filter(item => item.status === 'completed').length
  return {
    summary: {
      schema: 'task_execution_result.v1',
      taskId: plan.taskId,
      mode: 'sequential',
      status,
      completedSteps,
      totalSteps: plan.steps.length,
    },
    stepResults,
  }
}

export async function executeSequentialTaskPlan(args: {
  plan: TaskPlan
  sessionId: string
  runStep: (input: string, options: TurnOptions) => Promise<TurnResult>
  buildTurnOptions: () => TurnOptions
  checkpointWriter: TaskExecutionCheckpointWriter
}): Promise<TaskExecutionResult> {
  const stepResults: TaskExecutionStepResult[] = []

  args.checkpointWriter({
    taskId: args.plan.taskId,
    sessionId: args.sessionId,
    status: 'pending',
    stepIndex: 0,
    payload: createSequencePayload({
      phase: 'task_pending',
      totalSteps: args.plan.steps.length,
      currentStepId: null,
      currentStepIndex: null,
      normalizedInput: null,
      remainingStepInputs: args.plan.steps.map(step => step.input),
      completedStepIds: [],
    }),
    createdAt: new Date().toISOString(),
  })

  for (const [index, step] of args.plan.steps.entries()) {
    const remainingStepInputs = args.plan.steps.slice(index).map(item => item.input)
    const completedStepIds = stepResults
      .filter(item => item.status === 'completed')
      .map(item => item.stepId)
    args.checkpointWriter({
      taskId: args.plan.taskId,
      sessionId: args.sessionId,
      status: 'running',
      stepIndex: index + 1,
      payload: createSequencePayload({
        phase: 'step_running',
        totalSteps: args.plan.steps.length,
        currentStepId: step.id,
        currentStepIndex: index,
        normalizedInput: step.input,
        remainingStepInputs,
        completedStepIds,
      }),
      createdAt: new Date().toISOString(),
    })

    const turnOptions = {
      ...args.buildTurnOptions(),
      taskId: undefined,
      taskCheckpointWriter: undefined,
    }
    const result = await args.runStep(step.input, turnOptions)
    const status = classifyResponseStatus(result.response)

    stepResults.push({
      stepId: step.id,
      stepIndex: index + 1,
      input: step.input,
      response: result.response,
      status,
    })

    const completedAfterStep = stepResults
      .filter(item => item.status === 'completed')
      .map(item => item.stepId)

    args.checkpointWriter({
      taskId: args.plan.taskId,
      sessionId: args.sessionId,
      status,
      stepIndex: index + 1,
      payload: createSequencePayload({
        phase: 'step_result',
        totalSteps: args.plan.steps.length,
        currentStepId: step.id,
        currentStepIndex: index,
        normalizedInput: step.input,
        remainingStepInputs,
        completedStepIds: completedAfterStep,
        lastResponse: result.response,
      }),
      createdAt: new Date().toISOString(),
    })

    if (isTerminalFailure(status)) {
      return buildTaskExecutionResult(args.plan, status, stepResults)
    }
  }

  args.checkpointWriter({
    taskId: args.plan.taskId,
    sessionId: args.sessionId,
    status: 'completed',
    stepIndex: args.plan.steps.length,
    payload: createSequencePayload({
      phase: 'task_completed',
      totalSteps: args.plan.steps.length,
      currentStepId: null,
      currentStepIndex: null,
      normalizedInput: null,
      remainingStepInputs: [],
      completedStepIds: stepResults.map(item => item.stepId),
    }),
    createdAt: new Date().toISOString(),
  })

  return buildTaskExecutionResult(args.plan, 'completed', stepResults)
}

export function formatTaskExecutionResult(result: TaskExecutionResult): string {
  const lines = [
    `Task '${result.summary.taskId}' finished with status ${result.summary.status}.`,
    `- progress: ${result.summary.completedSteps}/${result.summary.totalSteps}`,
  ]

  for (const [index, step] of result.stepResults.entries()) {
    lines.push(`- step ${index + 1}: ${step.status} | ${step.response}`)
  }

  return lines.join('\n')
}