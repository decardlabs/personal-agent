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
      completedSteps: [],
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

  it('resolves step response placeholders in subsequent step inputs', async () => {
    const plan = parseTaskRunCommand('/task run echo alpha => echo {{step:stage-1-step-1.response}} => echo {{last.response}}')
    if (!plan) {
      throw new Error('expected task plan')
    }

    const executedInputs: string[] = []
    const result = await executeSequentialTaskPlan({
      plan,
      sessionId: 'session-task-template',
      buildTurnOptions: () => ({}),
      runStep: async input => {
        executedInputs.push(input)
        return {
          sessionId: 'session-task-template',
          turnId: `turn-${executedInputs.length}`,
          response: `Echo: ${input.slice(5)}`,
        }
      },
      checkpointWriter: () => undefined,
    })

    expect(executedInputs).toEqual([
      'echo alpha',
      'echo Echo: alpha',
      'echo Echo: Echo: alpha',
    ])
    expect(result.summary.status).toBe('completed')
    expect(result.stepResults[2]?.inputTemplate).toBe('echo {{last.response}}')
    expect(result.stepResults[2]?.input).toBe('echo Echo: Echo: alpha')
  })

  it('skips a step when condition is not met and continues dependency flow', async () => {
    const plan = parseTaskRunCommand('/task run echo alpha => when step:1.response contains "missing-token" then echo should-not-run => echo done')
    if (!plan) {
      throw new Error('expected task plan')
    }

    const executedInputs: string[] = []
    const result = await executeSequentialTaskPlan({
      plan,
      sessionId: 'session-task-conditional-skip',
      buildTurnOptions: () => ({}),
      runStep: async input => {
        executedInputs.push(input)
        return {
          sessionId: 'session-task-conditional-skip',
          turnId: `turn-${executedInputs.length}`,
          response: `Echo: ${input.slice(5)}`,
        }
      },
      checkpointWriter: () => undefined,
    })

    expect(executedInputs).toEqual(['echo alpha', 'echo done'])
    expect(result.summary.status).toBe('completed')
    expect(result.stepResults[1]?.wasSkipped).toBe(true)
    expect(result.stepResults[1]?.response).toContain('Step skipped: condition not met')
    expect(formatTaskExecutionResult(result)).toContain('(stage-2-step-1): skipped | Step skipped: condition not met')
  })

  it('executes conditional steps when condition is met', async () => {
    const plan = parseTaskRunCommand('/task run echo alpha => when step:1.response contains "alpha" then echo condition-hit')
    if (!plan) {
      throw new Error('expected task plan')
    }

    const executedInputs: string[] = []
    const result = await executeSequentialTaskPlan({
      plan,
      sessionId: 'session-task-conditional-hit',
      buildTurnOptions: () => ({}),
      runStep: async input => {
        executedInputs.push(input)
        return {
          sessionId: 'session-task-conditional-hit',
          turnId: `turn-${executedInputs.length}`,
          response: `Echo: ${input.slice(5)}`,
        }
      },
      checkpointWriter: () => undefined,
    })

    expect(executedInputs).toEqual(['echo alpha', 'echo condition-hit'])
    expect(result.stepResults[1]?.wasSkipped).toBe(false)
    expect(result.stepResults[1]?.response).toBe('Echo: condition-hit')
  })

  it('executes conditional step with startsWith operator', async () => {
    const plan = parseTaskRunCommand('/task run echo alpha => when step:1.response startsWith "Echo:" then echo starts-hit')
    if (!plan) {
      throw new Error('expected task plan')
    }

    const executedInputs: string[] = []
    await executeSequentialTaskPlan({
      plan,
      sessionId: 'session-task-conditional-starts',
      buildTurnOptions: () => ({}),
      runStep: async input => {
        executedInputs.push(input)
        return {
          sessionId: 'session-task-conditional-starts',
          turnId: `turn-${executedInputs.length}`,
          response: `Echo: ${input.slice(5)}`,
        }
      },
      checkpointWriter: () => undefined,
    })

    expect(executedInputs).toEqual(['echo alpha', 'echo starts-hit'])
  })

  it('executes conditional step with regex matches operator', async () => {
    const plan = parseTaskRunCommand('/task run echo alpha => when step:1.response matches "alpha$" then echo regex-hit')
    if (!plan) {
      throw new Error('expected task plan')
    }

    const executedInputs: string[] = []
    await executeSequentialTaskPlan({
      plan,
      sessionId: 'session-task-conditional-regex',
      buildTurnOptions: () => ({}),
      runStep: async input => {
        executedInputs.push(input)
        return {
          sessionId: 'session-task-conditional-regex',
          turnId: `turn-${executedInputs.length}`,
          response: `Echo: ${input.slice(5)}`,
        }
      },
      checkpointWriter: () => undefined,
    })

    expect(executedInputs).toEqual(['echo alpha', 'echo regex-hit'])
  })

  it('executes conditional step with numeric comparator operator', async () => {
    const plan = parseTaskRunCommand('/task run echo 7 => when step:1.response gte 7 then echo numeric-hit')
    if (!plan) {
      throw new Error('expected task plan')
    }

    const executedInputs: string[] = []
    await executeSequentialTaskPlan({
      plan,
      sessionId: 'session-task-conditional-numeric',
      buildTurnOptions: () => ({}),
      runStep: async input => {
        executedInputs.push(input)
        return {
          sessionId: 'session-task-conditional-numeric',
          turnId: `turn-${executedInputs.length}`,
          response: `Echo: ${input.slice(5)}`,
        }
      },
      checkpointWriter: () => undefined,
    })

    expect(executedInputs).toEqual(['echo 7', 'echo numeric-hit'])
  })

  it('executes conditional step with notContains operator', async () => {
    const plan = parseTaskRunCommand('/task run echo alpha => when step:1.response notContains "beta" then echo neg-contains-hit')
    if (!plan) {
      throw new Error('expected task plan')
    }

    const executedInputs: string[] = []
    await executeSequentialTaskPlan({
      plan,
      sessionId: 'session-task-conditional-not-contains',
      buildTurnOptions: () => ({}),
      runStep: async input => {
        executedInputs.push(input)
        return {
          sessionId: 'session-task-conditional-not-contains',
          turnId: `turn-${executedInputs.length}`,
          response: `Echo: ${input.slice(5)}`,
        }
      },
      checkpointWriter: () => undefined,
    })

    expect(executedInputs).toEqual(['echo alpha', 'echo neg-contains-hit'])
  })

  it('executes conditional step with notEquals operator', async () => {
    const plan = parseTaskRunCommand('/task run echo alpha => when step:1.response notEquals "Echo: beta" then echo neg-equals-hit')
    if (!plan) {
      throw new Error('expected task plan')
    }

    const executedInputs: string[] = []
    await executeSequentialTaskPlan({
      plan,
      sessionId: 'session-task-conditional-not-equals',
      buildTurnOptions: () => ({}),
      runStep: async input => {
        executedInputs.push(input)
        return {
          sessionId: 'session-task-conditional-not-equals',
          turnId: `turn-${executedInputs.length}`,
          response: `Echo: ${input.slice(5)}`,
        }
      },
      checkpointWriter: () => undefined,
    })

    expect(executedInputs).toEqual(['echo alpha', 'echo neg-equals-hit'])
  })

  it('executes conditional step with notMatches operator', async () => {
    const plan = parseTaskRunCommand('/task run echo alpha => when step:1.response notMatches "beta$" then echo neg-regex-hit')
    if (!plan) {
      throw new Error('expected task plan')
    }

    const executedInputs: string[] = []
    await executeSequentialTaskPlan({
      plan,
      sessionId: 'session-task-conditional-not-matches',
      buildTurnOptions: () => ({}),
      runStep: async input => {
        executedInputs.push(input)
        return {
          sessionId: 'session-task-conditional-not-matches',
          turnId: `turn-${executedInputs.length}`,
          response: `Echo: ${input.slice(5)}`,
        }
      },
      checkpointWriter: () => undefined,
    })

    expect(executedInputs).toEqual(['echo alpha', 'echo neg-regex-hit'])
  })
})