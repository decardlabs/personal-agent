import type { TurnOptions, TurnResult } from './runTurn.js'
import type { TaskPlan, TaskPlanStep } from './taskPlan.js'
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
  label: string
  stepIndex: number
  inputTemplate: string
  input: string
  response: string
  status: TaskState
}

export type TaskExecutionSummary = {
  schema: 'task_execution_result.v1'
  taskId: string
  mode: TaskPlan['mode']
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
  mode: TaskPlan['mode']
  phase: TaskSequenceCheckpointPhase
  totalSteps: number
  currentStepId: string | null
  currentStepIndex: number | null
  normalizedInput: string | null
  remainingStepInputs: string[]
  pendingSteps: Array<{
    id: string
    label: string
    input: string
    dependsOn: string[]
  }>
  completedSteps: Array<{
    id: string
    label: string
    response: string
  }>
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
  mode: TaskPlan['mode']
  phase: TaskSequenceCheckpointPhase
  totalSteps: number
  currentStepId: string | null
  currentStepIndex: number | null
  normalizedInput: string | null
  remainingStepInputs: string[]
  pendingSteps: TaskPlanStep[]
  completedSteps: TaskExecutionStepResult[]
  completedStepIds: string[]
  lastResponse?: string | null
}): TaskSequenceCheckpointPayload {
  return {
    schema: 'task_sequence.v1',
    mode: args.mode,
    phase: args.phase,
    totalSteps: args.totalSteps,
    currentStepId: args.currentStepId,
    currentStepIndex: args.currentStepIndex,
    normalizedInput: args.normalizedInput,
    remainingStepInputs: args.remainingStepInputs,
    pendingSteps: args.pendingSteps.map(step => ({
      id: step.id,
      label: step.label,
      input: step.input,
      dependsOn: [...step.dependsOn],
    })),
    completedSteps: args.completedSteps
      .filter(step => step.status === 'completed')
      .map(step => ({
        id: step.stepId,
        label: step.label,
        response: step.response,
      })),
    completedStepIds: args.completedStepIds,
    lastResponse: args.lastResponse ?? null,
  }
}

function buildTaskExecutionResult(
  plan: TaskPlan,
  status: TaskState,
  stepResults: TaskExecutionStepResult[],
  totalSteps: number,
): TaskExecutionResult {
  const completedSteps = stepResults.filter(item => item.status === 'completed').length
  return {
    summary: {
      schema: 'task_execution_result.v1',
      taskId: plan.taskId,
      mode: plan.mode,
      status,
      completedSteps,
      totalSteps,
    },
    stepResults,
  }
}

function getRunnableSteps(plan: TaskPlan, completedStepIds: Set<string>, startedStepIds: Set<string>): TaskPlanStep[] {
  return plan.steps.filter(step => (
    !completedStepIds.has(step.id)
    && !startedStepIds.has(step.id)
    && step.dependsOn.every(dependencyId => completedStepIds.has(dependencyId))
  ))
}

function resolveStepInputTemplate(inputTemplate: string, completedSteps: TaskExecutionStepResult[]): string {
  const byLabel = new Map(completedSteps.map(step => [step.label, step.response]))
  const byStepIndex = new Map(completedSteps.map(step => [String(step.stepIndex), step.response]))
  const lastResponse = completedSteps.length > 0
    ? completedSteps[completedSteps.length - 1]?.response
    : null

  return inputTemplate.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, tokenRaw: string) => {
    const token = tokenRaw.trim()
    if (token === 'last.response') {
      return lastResponse ?? ''
    }

    const labelToken = token.match(/^step:([a-zA-Z0-9_-]+)\.response$/)
    if (labelToken) {
      return byLabel.get(labelToken[1] ?? '') ?? ''
    }

    const indexToken = token.match(/^step:(\d+)\.response$/)
    if (indexToken) {
      return byStepIndex.get(indexToken[1] ?? '') ?? ''
    }

    return ''
  })
}

export async function executeSequentialTaskPlan(args: {
  plan: TaskPlan
  sessionId: string
  runStep: (input: string, options: TurnOptions) => Promise<TurnResult>
  buildTurnOptions: () => TurnOptions
  checkpointWriter: TaskExecutionCheckpointWriter
  initialCompletedSteps?: TaskExecutionStepResult[]
  totalSteps?: number
}): Promise<TaskExecutionResult> {
  const totalSteps = args.totalSteps ?? args.plan.steps.length
  const stepResults: TaskExecutionStepResult[] = [...(args.initialCompletedSteps ?? [])]
  const completedStepIds = new Set<string>(
    (args.initialCompletedSteps ?? [])
      .filter(step => step.status === 'completed')
      .map(step => step.stepId),
  )
  const startedStepIds = new Set<string>((args.initialCompletedSteps ?? []).map(step => step.stepId))

  args.checkpointWriter({
    taskId: args.plan.taskId,
    sessionId: args.sessionId,
    status: 'pending',
    stepIndex: 0,
    payload: createSequencePayload({
      mode: args.plan.mode,
      phase: 'task_pending',
      totalSteps,
      currentStepId: null,
      currentStepIndex: null,
      normalizedInput: null,
      remainingStepInputs: args.plan.steps.map(step => step.input),
      pendingSteps: args.plan.steps,
      completedSteps: stepResults,
      completedStepIds: [...completedStepIds],
    }),
    createdAt: new Date().toISOString(),
  })

  while (!args.plan.steps.every(step => completedStepIds.has(step.id))) {
    const runnableSteps = getRunnableSteps(args.plan, completedStepIds, startedStepIds)
    if (runnableSteps.length === 0) {
      return buildTaskExecutionResult(args.plan, 'failed', stepResults, totalSteps)
    }

    for (const step of runnableSteps) {
      startedStepIds.add(step.id)
      const stepIndex = stepResults.length + 1
      const remainingSteps = args.plan.steps.filter(item => !completedStepIds.has(item.id) && item.id !== step.id)
      const renderedInput = resolveStepInputTemplate(step.input, stepResults)
      const remainingStepInputs = [renderedInput, ...remainingSteps.map(item => item.input)]

      args.checkpointWriter({
        taskId: args.plan.taskId,
        sessionId: args.sessionId,
        status: 'running',
        stepIndex,
        payload: createSequencePayload({
          mode: args.plan.mode,
          phase: 'step_running',
          totalSteps,
          currentStepId: step.id,
          currentStepIndex: stepIndex - 1,
          normalizedInput: renderedInput,
          remainingStepInputs,
          pendingSteps: [step, ...remainingSteps],
          completedSteps: stepResults,
          completedStepIds: [...completedStepIds],
        }),
        createdAt: new Date().toISOString(),
      })

      const turnOptions = {
        ...args.buildTurnOptions(),
        taskId: undefined,
        taskCheckpointWriter: undefined,
      }
      const result = await args.runStep(renderedInput, turnOptions)
      const status = classifyResponseStatus(result.response)

      stepResults.push({
        stepId: step.id,
        label: step.label,
        stepIndex,
        inputTemplate: step.input,
        input: renderedInput,
        response: result.response,
        status,
      })

      if (status === 'completed') {
        completedStepIds.add(step.id)
      }

      const pendingSteps = args.plan.steps.filter(item => !completedStepIds.has(item.id) && item.id !== step.id)

      args.checkpointWriter({
        taskId: args.plan.taskId,
        sessionId: args.sessionId,
        status,
        stepIndex,
        payload: createSequencePayload({
          mode: args.plan.mode,
          phase: 'step_result',
          totalSteps,
          currentStepId: step.id,
          currentStepIndex: stepIndex - 1,
          normalizedInput: renderedInput,
          remainingStepInputs: pendingSteps.map(item => item.input),
          pendingSteps,
          completedSteps: stepResults,
          completedStepIds: [...completedStepIds],
          lastResponse: result.response,
        }),
        createdAt: new Date().toISOString(),
      })

      if (isTerminalFailure(status)) {
        return buildTaskExecutionResult(args.plan, status, stepResults, totalSteps)
      }
    }
  }

  args.checkpointWriter({
    taskId: args.plan.taskId,
    sessionId: args.sessionId,
    status: 'completed',
    stepIndex: totalSteps,
    payload: createSequencePayload({
      mode: args.plan.mode,
      phase: 'task_completed',
      totalSteps,
      currentStepId: null,
      currentStepIndex: null,
      normalizedInput: null,
      remainingStepInputs: [],
      pendingSteps: [],
      completedSteps: stepResults,
      completedStepIds: stepResults.map(item => item.stepId),
    }),
    createdAt: new Date().toISOString(),
  })

  return buildTaskExecutionResult(args.plan, 'completed', stepResults, totalSteps)
}

export function formatTaskExecutionResult(result: TaskExecutionResult): string {
  const lines = [
    `Task '${result.summary.taskId}' finished with status ${result.summary.status}.`,
    `- mode: ${result.summary.mode}`,
    `- progress: ${result.summary.completedSteps}/${result.summary.totalSteps}`,
  ]

  for (const step of result.stepResults) {
    lines.push(`- step ${step.stepIndex} (${step.label}): ${step.status} | ${step.response}`)
  }

  return lines.join('\n')
}