import { randomUUID } from 'node:crypto'

export type TaskPlanStep = {
  id: string
  label: string
  input: string
  dependsOn: string[]
  condition?: TaskStepCondition
}

export type TaskPlan = {
  taskId: string
  mode: 'sequential' | 'dependency_graph'
  steps: TaskPlanStep[]
}

export type TaskStepCondition = {
  source: string
  operator:
  | 'contains'
  | 'notContains'
  | 'equals'
  | 'notEquals'
  | 'startsWith'
  | 'endsWith'
  | 'matches'
  | 'notMatches'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  value: string
}

function normalizeConditionValue(rawValue: string): string {
  const trimmed = rawValue.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseConditionalStep(input: string): { commandInput: string; condition?: TaskStepCondition } {
  const match = input.match(
    /^when\s+([^\s]+)\s+(contains|notcontains|equals|notequals|startswith|endswith|matches|notmatches|gt|gte|lt|lte)\s+(.+?)\s+then\s+(.+)$/i,
  )
  if (!match) {
    return { commandInput: input }
  }

  const source = match[1]?.trim()
  const rawOperator = match[2]?.toLowerCase()
  const operator = rawOperator === 'startswith'
    ? 'startsWith'
    : rawOperator === 'endswith'
      ? 'endsWith'
      : rawOperator === 'notcontains'
        ? 'notContains'
        : rawOperator === 'notequals'
          ? 'notEquals'
          : rawOperator === 'notmatches'
            ? 'notMatches'
      : rawOperator as TaskStepCondition['operator']
  const value = normalizeConditionValue(match[3] ?? '')
  const commandInput = match[4]?.trim()
  if (!source || !commandInput) {
    return { commandInput: input }
  }

  return {
    commandInput,
    condition: {
      source,
      operator,
      value,
    },
  }
}

function splitStageSegments(body: string): string[] {
  return body.split('=>').map(part => part.trim()).filter(Boolean)
}

function splitStageSteps(stage: string): string[] {
  const bracketed = stage.startsWith('[') && stage.endsWith(']')
  const content = bracketed ? stage.slice(1, -1).trim() : stage
  return content.split('|').map(part => part.trim()).filter(Boolean)
}

export function parseTaskRunCommand(input: string): TaskPlan | null {
  const normalized = input.trim()
  const prefix = '/task run '
  if (!normalized.toLowerCase().startsWith(prefix)) {
    return null
  }

  const body = normalized.slice(prefix.length).trim()
  if (!body) {
    return null
  }

  const stages = splitStageSegments(body)
  if (stages.length < 2) {
    return null
  }

  const taskId = `task-${randomUUID()}`
  const steps: TaskPlanStep[] = []
  let previousStageStepIds: string[] = []

  for (const [stageIndex, stage] of stages.entries()) {
    const stageSteps = splitStageSteps(stage)
    if (stageSteps.length === 0) {
      return null
    }

    const currentStageStepIds: string[] = []

    for (const [stepIndex, stepInput] of stageSteps.entries()) {
      const parsed = parseConditionalStep(stepInput)
      const id = `${taskId}:step-${steps.length + 1}`
      const label = `stage-${stageIndex + 1}-step-${stepIndex + 1}`
      steps.push({
        id,
        label,
        input: parsed.commandInput,
        dependsOn: previousStageStepIds,
        condition: parsed.condition,
      })
      currentStageStepIds.push(id)
    }

    previousStageStepIds = currentStageStepIds
  }

  const mode = steps.some(step => step.dependsOn.length > 1) || stages.some(stage => splitStageSteps(stage).length > 1)
    ? 'dependency_graph'
    : 'sequential'

  return {
    taskId,
    mode,
    steps,
  }
}