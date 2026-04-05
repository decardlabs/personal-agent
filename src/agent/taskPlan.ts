import { randomUUID } from 'node:crypto'

export type TaskPlanStep = {
  id: string
  label: string
  input: string
  dependsOn: string[]
  condition?: TaskStepCondition | TaskStepCompoundCondition
}

export type TaskStepCompoundCondition = {
  combinator: 'and' | 'or'
  clauses: TaskStepCondition[]
}

export function isCompoundCondition(
  c: TaskStepCondition | TaskStepCompoundCondition,
): c is TaskStepCompoundCondition {
  return 'combinator' in c && 'clauses' in c
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

function normalizeOperator(rawOperator: string): TaskStepCondition['operator'] {
  switch (rawOperator) {
    case 'startswith': return 'startsWith'
    case 'endswith': return 'endsWith'
    case 'notcontains': return 'notContains'
    case 'notequals': return 'notEquals'
    case 'notmatches': return 'notMatches'
    default: return rawOperator as TaskStepCondition['operator']
  }
}

function parseSingleConditionClause(body: string): TaskStepCondition | null {
  const match = body.trim().match(
    /^([^\s]+)\s+(contains|notcontains|equals|notequals|startswith|endswith|matches|notmatches|gt|gte|lt|lte)\s+(.+)$/i,
  )
  if (!match) {
    return null
  }
  const source = match[1]?.trim()
  if (!source) {
    return null
  }
  const operator = normalizeOperator(match[2]?.toLowerCase() ?? '')
  const value = normalizeConditionValue(match[3] ?? '')
  return { source, operator, value }
}

function splitOnCombinator(body: string): { clauses: string[]; combinator: 'and' | 'or' } | null {
  const parts: string[] = []
  const combinators: ('and' | 'or')[] = []
  let current = ''
  let inQuote = false
  let quoteChar = ''
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] as string
    if (inQuote) {
      current += ch
      if (ch === quoteChar) inQuote = false
      continue
    }
    if (ch === '"' || ch === "'") {
      inQuote = true
      quoteChar = ch
      current += ch
      continue
    }
    const rest = body.slice(i)
    const andMatch = rest.match(/^\s+and\s+/i)
    const orMatch = rest.match(/^\s+or\s+/i)
    if (andMatch) {
      parts.push(current.trim())
      combinators.push('and')
      current = ''
      i += andMatch[0].length - 1
      continue
    }
    if (orMatch) {
      parts.push(current.trim())
      combinators.push('or')
      current = ''
      i += orMatch[0].length - 1
      continue
    }
    current += ch
  }
  if (current.trim()) {
    parts.push(current.trim())
  }
  if (parts.length < 2 || combinators.length === 0) {
    return null
  }
  return { clauses: parts, combinator: combinators[0] as 'and' | 'or' }
}

function parseConditionalStep(input: string): { commandInput: string; condition?: TaskStepCondition | TaskStepCompoundCondition } {
  const match = input.match(/^when\s+(.+)\s+then\s+(.+)$/i)
  if (!match) {
    return { commandInput: input }
  }
  const condBody = match[1]?.trim()
  const commandInput = match[2]?.trim()
  if (!condBody || !commandInput) {
    return { commandInput: input }
  }

  const splitResult = splitOnCombinator(condBody)
  if (splitResult) {
    const clauses = splitResult.clauses
      .map(c => parseSingleConditionClause(c))
      .filter((c): c is TaskStepCondition => c !== null)
    if (clauses.length >= 2) {
      return {
        commandInput,
        condition: { combinator: splitResult.combinator, clauses },
      }
    }
  }

  const condition = parseSingleConditionClause(condBody)
  if (!condition) {
    return { commandInput: input }
  }
  return { commandInput, condition }
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