import { randomUUID } from 'node:crypto'

export type TaskPlanStep = {
  id: string
  label: string
  input: string
  dependsOn: string[]
}

export type TaskPlan = {
  taskId: string
  mode: 'sequential' | 'dependency_graph'
  steps: TaskPlanStep[]
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
      const id = `${taskId}:step-${steps.length + 1}`
      const label = `stage-${stageIndex + 1}-step-${stepIndex + 1}`
      steps.push({
        id,
        label,
        input: stepInput,
        dependsOn: previousStageStepIds,
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