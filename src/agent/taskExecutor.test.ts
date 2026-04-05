import { describe, expect, it } from 'vitest'
import { executeSequentialTaskPlan, formatTaskExecutionResult } from './taskExecutor.js'
import { parseTaskRunCommand } from './taskPlan.js'

describe('taskExecutor', () => {
  it('executes all sequential steps and reports completion', async () => {
    const plan = parseTaskRunCommand('/task run echo one => echo two')
    if (!plan) {
      throw new Error('expected task plan')
    }

    const checkpoints: Array<{ status: string; stepIndex: number; payload: unknown }> = []
    const result = await executeSequentialTaskPlan({
      plan,
      sessionId: 'session-task-exec',
      buildTurnOptions: () => ({}),
      runStep: async input => ({ sessionId: 'session-task-exec', turnId: `turn-${input}`, response: `Echo: ${input.slice(5)}` }),
      checkpointWriter: checkpoint => {
        checkpoints.push({ status: checkpoint.status, stepIndex: checkpoint.stepIndex, payload: checkpoint.payload })
      },
    })

    expect(result.summary.status).toBe('completed')
    expect(result.summary.completedSteps).toBe(2)
    expect(checkpoints[0]?.status).toBe('pending')
    expect(checkpoints[0]?.stepIndex).toBe(0)
    expect(checkpoints[0]?.payload).toMatchObject({
      schema: 'task_sequence.v1',
      mode: 'sequential',
      phase: 'task_pending',
      totalSteps: 2,
      pendingSteps: [
        expect.objectContaining({ input: 'echo one' }),
        expect.objectContaining({ input: 'echo two' }),
      ],
    })
    expect(formatTaskExecutionResult(result)).toContain('mode: sequential')
    expect(formatTaskExecutionResult(result)).toContain('progress: 2/2')
  })

  it('stops on timeout and preserves partial progress', async () => {
    const plan = parseTaskRunCommand('/task run echo one => echo two')
    if (!plan) {
      throw new Error('expected task plan')
    }

    let calls = 0
    const result = await executeSequentialTaskPlan({
      plan,
      sessionId: 'session-task-timeout',
      buildTurnOptions: () => ({}),
      runStep: async input => {
        calls += 1
        return {
          sessionId: 'session-task-timeout',
          turnId: `turn-${calls}`,
          response: calls === 1 ? `Echo: ${input.slice(5)}` : 'Turn cancelled: tool execution timed out.',
        }
      },
      checkpointWriter: () => undefined,
    })

    expect(result.summary.status).toBe('timeout')
    expect(result.summary.completedSteps).toBe(1)
    expect(result.stepResults).toHaveLength(2)
  })

  it('executes branch-aware stages once dependencies are completed', async () => {
    const plan = parseTaskRunCommand('/task run echo prepare => [echo lint | echo test] => echo release')
    if (!plan) {
      throw new Error('expected task plan')
    }

    const executedInputs: string[] = []
    const result = await executeSequentialTaskPlan({
      plan,
      sessionId: 'session-task-graph',
      buildTurnOptions: () => ({}),
      runStep: async input => {
        executedInputs.push(input)
        return {
          sessionId: 'session-task-graph',
          turnId: `turn-${executedInputs.length}`,
          response: `Echo: ${input.slice(5)}`,
        }
      },
      checkpointWriter: () => undefined,
    })

    expect(result.summary.mode).toBe('dependency_graph')
    expect(result.summary.status).toBe('completed')
    expect(executedInputs).toEqual(['echo prepare', 'echo lint', 'echo test', 'echo release'])
    expect(formatTaskExecutionResult(result)).toContain('mode: dependency_graph')
    expect(formatTaskExecutionResult(result)).toContain('(stage-3-step-1): completed | Echo: release')
  })
})