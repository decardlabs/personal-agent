import type { TurnOptions, TurnResult } from './runTurn.js'
import type { TaskPlan } from './taskPlan.js'
import type { TaskState } from './taskStateMachine.js'

export type TaskExecutionCheckpointWriter = (checkpoint: {
  taskId: string
  sessionId: string
  status: TaskState
  stepIndex: number
  payload: Record<string, unknown>
  createdAt: string
}) => void

export type TaskExecutionStepResult = {
  stepId: string
  input: string
  response: string
  status: TaskState
}

export type TaskExecutionResult = {
  taskId: string
  status: TaskState
  completedSteps: number
  totalSteps: number
  stepResults: TaskExecutionStepResult[]
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
    payload: {
      kind: 'task_sequence',
      totalSteps: args.plan.steps.length,
      remainingStepInputs: args.plan.steps.map(step => step.input),
    },
    createdAt: new Date().toISOString(),
  })

  for (const [index, step] of args.plan.steps.entries()) {
    const remainingStepInputs = args.plan.steps.slice(index).map(item => item.input)
    args.checkpointWriter({
      taskId: args.plan.taskId,
      sessionId: args.sessionId,
      status: 'running',
      stepIndex: index + 1,
      payload: {
        kind: 'task_sequence',
        totalSteps: args.plan.steps.length,
        currentStepId: step.id,
        currentStepIndex: index,
        normalizedInput: step.input,
        remainingStepInputs,
      },
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
      input: step.input,
      response: result.response,
      status,
    })

    args.checkpointWriter({
      taskId: args.plan.taskId,
      sessionId: args.sessionId,
      status,
      stepIndex: index + 1,
      payload: {
        kind: 'task_sequence',
        totalSteps: args.plan.steps.length,
        currentStepId: step.id,
        currentStepIndex: index,
        normalizedInput: step.input,
        remainingStepInputs,
        response: result.response,
      },
      createdAt: new Date().toISOString(),
    })

    if (isTerminalFailure(status)) {
      return {
        taskId: args.plan.taskId,
        status,
        completedSteps: stepResults.filter(item => item.status === 'completed').length,
        totalSteps: args.plan.steps.length,
        stepResults,
      }
    }
  }

  args.checkpointWriter({
    taskId: args.plan.taskId,
    sessionId: args.sessionId,
    status: 'completed',
    stepIndex: args.plan.steps.length,
    payload: {
      kind: 'task_sequence',
      totalSteps: args.plan.steps.length,
      remainingStepInputs: [],
      completed: true,
    },
    createdAt: new Date().toISOString(),
  })

  return {
    taskId: args.plan.taskId,
    status: 'completed',
    completedSteps: args.plan.steps.length,
    totalSteps: args.plan.steps.length,
    stepResults,
  }
}

export function formatTaskExecutionResult(result: TaskExecutionResult): string {
  const lines = [
    `Task '${result.taskId}' finished with status ${result.status}.`,
    `- progress: ${result.completedSteps}/${result.totalSteps}`,
  ]

  for (const [index, step] of result.stepResults.entries()) {
    lines.push(`- step ${index + 1}: ${step.status} | ${step.response}`)
  }

  return lines.join('\n')
}