import { describe, expect, it } from 'vitest'
import {
  findUtilityCommandByInput,
  getRegisteredUtilityAssistTriggers,
  getRegisteredUtilityExactTriggers,
  getUtilityCommandRegistry,
  validateUtilityCommandRegistry,
} from './utilityRegistry.js'

describe('utilityRegistry', () => {
  it('finds registered commands by normalized input', () => {
    expect(findUtilityCommandByInput('/help')?.id).toBe('help')
    expect(findUtilityCommandByInput('/history --all')?.id).toBe('history_all')
    expect(findUtilityCommandByInput('/diag --json')?.id).toBe('diag_json')
    expect(findUtilityCommandByInput('/dashboard')?.id).toBe('dashboard')
    expect(findUtilityCommandByInput('/dashboard --compact')?.id).toBe('dashboard_compact')
    expect(findUtilityCommandByInput('/dashboard --detailed')?.id).toBe('dashboard_detailed')
    expect(findUtilityCommandByInput('/clear-history')?.id).toBe('clear_history')
    expect(findUtilityCommandByInput('/memory --detailed')?.id).toBe('memory_detailed')
    expect(findUtilityCommandByInput('/why --json')?.id).toBe('why_json')
    expect(findUtilityCommandByInput('/task')?.id).toBe('task')
    expect(findUtilityCommandByInput('/task run echo a => echo b')?.id).toBe('task_run')
    expect(findUtilityCommandByInput('/task latest')?.id).toBe('task_latest')
    expect(findUtilityCommandByInput('/task checkpoints task-1')?.id).toBe('task_checkpoints')
    expect(findUtilityCommandByInput('/task resume task-1')?.id).toBe('task_resume')
    expect(findUtilityCommandByInput('/status')?.id).toBe('status')
    expect(findUtilityCommandByInput('/metrics dream')?.id).toBe('metrics_dream')
    expect(findUtilityCommandByInput('/metrics dream --limit 10')?.id).toBe('metrics_dream')
    expect(findUtilityCommandByInput('/metrics dream --window 24h')?.id).toBe('metrics_dream')
    expect(findUtilityCommandByInput('/consolidate-memory --auto')?.id).toBe('consolidate_memory_auto')
    expect(findUtilityCommandByInput('/model')?.id).toBe('model')
    expect(findUtilityCommandByInput('/model clear')?.id).toBe('model_clear')
    expect(findUtilityCommandByInput('/model set quality')?.id).toBe('model_set')
    expect(findUtilityCommandByInput('/model set')?.id).toBe('model_set')
    expect(findUtilityCommandByInput('exit')?.id).toBe('exit')
    expect(findUtilityCommandByInput('quit')?.id).toBe('quit')
  })

  it('supports case-insensitive and trimmed inputs', () => {
    expect(findUtilityCommandByInput('  /HELP  ')?.id).toBe('help')
    expect(findUtilityCommandByInput(' /Diag ')?.id).toBe('diag')
  })

  it('returns null for unknown command', () => {
    expect(findUtilityCommandByInput('/unknown')).toBeNull()
  })

  it('exposes consistent trigger list with registry items', () => {
    const registry = getUtilityCommandRegistry()
    const exactTriggers = getRegisteredUtilityExactTriggers()
    const assistTriggers = getRegisteredUtilityAssistTriggers()

    expect(exactTriggers).toContain('/help')
    expect(exactTriggers).toContain('/diag --json')
    expect(exactTriggers).toContain('/dashboard')
    expect(exactTriggers).toContain('/dashboard --compact')
    expect(exactTriggers).toContain('/dashboard --detailed')
    expect(exactTriggers).toContain('/status')
    expect(exactTriggers).not.toContain('/metrics dream')
    expect(exactTriggers).toContain('/memory')
    expect(exactTriggers).toContain('/model')
    expect(exactTriggers).toContain('/task')
    expect(exactTriggers).toContain('/task latest')
    expect(exactTriggers).toContain('exit')
    expect(exactTriggers).toContain('quit')
    expect(exactTriggers).not.toContain('/model set')
    expect(exactTriggers).not.toContain('/task checkpoints')
    expect(exactTriggers).not.toContain('/task run')
    expect(exactTriggers).not.toContain('/task resume')

    expect(assistTriggers).toContain('/model set')
    expect(assistTriggers).toContain('/consolidate-memory')
    expect(assistTriggers).toContain('/task checkpoints')
    expect(assistTriggers).toContain('/task run')
    expect(assistTriggers).toContain('/task resume')
    expect(assistTriggers).toContain('/metrics dream')
    expect(assistTriggers.length).toBe(registry.length)
  })

  it('has no conflicting utility command triggers', () => {
    expect(validateUtilityCommandRegistry()).toEqual([])
  })
})
