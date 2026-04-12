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
  clauses: Array<TaskStepCondition | TaskStepCompoundCondition>
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

function splitOnTopLevel(body: string, op: 'and' | 'or'): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let inQuote = false
  let quoteChar = ''
  const pattern = new RegExp(`^\\s+${op}\\s+`, 'i')
  let i = 0
  while (i < body.length) {
    const ch = body[i] as string
    if (inQuote) {
      current += ch
      if (ch === quoteChar) inQuote = false
      i++
      continue
    }
    if (ch === '"' || ch === "'") {
      inQuote = true
      quoteChar = ch
      current += ch
      i++
      continue
    }
    if (ch === '(') { depth++; current += ch; i++; continue }
    if (ch === ')') { depth--; current += ch; i++; continue }
    if (depth === 0) {
      const rest = body.slice(i)
      const m = rest.match(pattern)
      if (m) {
        parts.push(current.trim())
        current = ''
        i += m[0].length
        continue
      }
    }
    current += ch
    i++
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function findMatchingClose(str: string, openPos: number): number {
  let depth = 0
  let inQuote = false
  let quoteChar = ''
  for (let i = openPos; i < str.length; i++) {
    const ch = str[i] as string
    if (inQuote) {
      if (ch === quoteChar) inQuote = false
      continue
    }
    if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; continue }
    if (ch === '(') depth++
    if (ch === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function parseConditionExpr(body: string): TaskStepCondition | TaskStepCompoundCondition | null {
  const trimmed = body.trim()

  // Strip fully-wrapped parentheses when opening paren matches the last char
  if (trimmed.startsWith('(') && findMatchingClose(trimmed, 0) === trimmed.length - 1) {
    return parseConditionExpr(trimmed.slice(1, -1).trim())
  }

  // 'or' has lower precedence — split on top-level 'or' first
  const orParts = splitOnTopLevel(trimmed, 'or')
  if (orParts.length > 1) {
    const clauses = orParts
      .map(p => parseConditionExpr(p))
      .filter((c): c is TaskStepCondition | TaskStepCompoundCondition => c !== null)
    if (clauses.length >= 2) {
      return { combinator: 'or', clauses }
    }
  }

  // 'and' has higher precedence — split on top-level 'and' next
  const andParts = splitOnTopLevel(trimmed, 'and')
  if (andParts.length > 1) {
    const clauses = andParts
      .map(p => parseConditionExpr(p))
      .filter((c): c is TaskStepCondition | TaskStepCompoundCondition => c !== null)
    if (clauses.length >= 2) {
      return { combinator: 'and', clauses }
    }
  }

  return parseSingleConditionClause(trimmed)
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
  const condition = parseConditionExpr(condBody)
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