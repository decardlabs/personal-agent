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

  it('returns null for invalid or single-step commands', () => {
    expect(parseTaskRunCommand('/task run')).toBeNull()
    expect(parseTaskRunCommand('/task run echo only')).toBeNull()
    expect(parseTaskRunCommand('echo one => echo two')).toBeNull()
  })
})