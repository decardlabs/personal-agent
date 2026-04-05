import { describe, expect, it } from 'vitest'
import { parseTaskRunCommand } from './taskPlan.js'

describe('taskPlan', () => {
  it('parses a sequential /task run command into dependent steps', () => {
    const plan = parseTaskRunCommand('/task run echo one => search two => read src/index.ts')

    expect(plan).not.toBeNull()
    expect(plan?.mode).toBe('sequential')
    expect(plan?.steps).toHaveLength(3)
    expect(plan?.steps[0]?.input).toBe('echo one')
    expect(plan?.steps[1]?.dependsOn).toHaveLength(1)
  })

  it('parses bracketed branch stages into a dependency graph', () => {
    const plan = parseTaskRunCommand('/task run echo prepare => [echo lint | echo test] => echo release')

    expect(plan).not.toBeNull()
    expect(plan?.mode).toBe('dependency_graph')
    expect(plan?.steps).toHaveLength(4)
    expect(plan?.steps[1]?.dependsOn).toEqual([plan?.steps[0]?.id])
    expect(plan?.steps[2]?.dependsOn).toEqual([plan?.steps[0]?.id])
    expect(plan?.steps[3]?.dependsOn).toEqual([
      plan?.steps[1]?.id,
      plan?.steps[2]?.id,
    ])
  })

  it('parses conditional steps with when/then syntax', () => {
    const plan = parseTaskRunCommand('/task run echo seed => when step:1.response contains "seed" then echo ready')

    expect(plan).not.toBeNull()
    expect(plan?.steps).toHaveLength(2)
    expect(plan?.steps[1]?.input).toBe('echo ready')
    expect(plan?.steps[1]?.condition).toEqual({
      source: 'step:1.response',
      operator: 'contains',
      value: 'seed',
    })
  })

  it('returns null for invalid or single-step commands', () => {
    expect(parseTaskRunCommand('/task run')).toBeNull()
    expect(parseTaskRunCommand('/task run echo only')).toBeNull()
    expect(parseTaskRunCommand('echo one => echo two')).toBeNull()
  })
})