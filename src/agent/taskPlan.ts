import { randomUUID } from 'node:crypto'

export type TaskPlanStep = {
  id: string
  input: string
  dependsOn: string[]
}

export type TaskPlan = {
  taskId: string
  mode: 'sequential'
  steps: TaskPlanStep[]
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

  const parts = body.split('=>').map(part => part.trim()).filter(Boolean)
  if (parts.length < 2) {
    return null
  }

  const taskId = `task-${randomUUID()}`
  const steps: TaskPlanStep[] = parts.map((stepInput, index) => ({
    id: `${taskId}:step-${index + 1}`,
    input: stepInput,
    dependsOn: index === 0 ? [] : [`${taskId}:step-${index}`],
  }))

  return {
    taskId,
    mode: 'sequential',
    steps,
  }
}