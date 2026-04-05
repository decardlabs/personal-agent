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

  it('parses extended condition operators including numeric comparators', () => {
    const plan = parseTaskRunCommand('/task run echo 7 => when step:1.response gt 5 then echo large')

    expect(plan).not.toBeNull()
    expect(plan?.steps[1]?.condition).toEqual({
      source: 'step:1.response',
      operator: 'gt',
      value: '5',
    })
  })

  it('normalizes startsWith and endsWith operators', () => {
    const plan = parseTaskRunCommand('/task run echo alpha => when step:1.response startsWith "Echo" then echo good')

    expect(plan).not.toBeNull()
    expect(plan?.steps[1]?.condition?.operator).toBe('startsWith')
  })

  it('normalizes negative condition operators', () => {
    const plan = parseTaskRunCommand('/task run echo alpha => when step:1.response notContains "beta" then echo pass')

    expect(plan).not.toBeNull()
    expect(plan?.steps[1]?.condition).toEqual({
      source: 'step:1.response',
      operator: 'notContains',
      value: 'beta',
    })
  })

  it('parses compound "and" condition into a compound condition object', () => {
    const plan = parseTaskRunCommand(
      '/task run echo alpha => echo beta => when step:1.response contains "alpha" and step:2.response contains "beta" then echo compound-ok',
    )

    expect(plan).not.toBeNull()
    expect(plan?.steps[2]?.condition).toEqual({
      combinator: 'and',
      clauses: [
        { source: 'step:1.response', operator: 'contains', value: 'alpha' },
        { source: 'step:2.response', operator: 'contains', value: 'beta' },
      ],
    })
  })

  it('parses compound "or" condition into a compound condition object', () => {
    const plan = parseTaskRunCommand(
      '/task run echo alpha => when step:1.response equals "fail" or step:1.response equals "error" then echo fallback',
    )

    expect(plan).not.toBeNull()
    expect(plan?.steps[1]?.condition).toEqual({
      combinator: 'or',
      clauses: [
        { source: 'step:1.response', operator: 'equals', value: 'fail' },
        { source: 'step:1.response', operator: 'equals', value: 'error' },
      ],
    })
  })

  it('returns null for invalid or single-step commands', () => {
    expect(parseTaskRunCommand('/task run')).toBeNull()
    expect(parseTaskRunCommand('/task run echo only')).toBeNull()
    expect(parseTaskRunCommand('echo one => echo two')).toBeNull()
  })
})