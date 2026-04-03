import { describe, expect, it } from 'vitest'
import {
  findUtilityCommandByInput,
  getRegisteredUtilityAssistTriggers,
  getRegisteredUtilityExactTriggers,
  getUtilityCommandRegistry,
} from './utilityRegistry.js'

describe('utilityRegistry', () => {
  it('finds registered commands by normalized input', () => {
    expect(findUtilityCommandByInput('/help')?.id).toBe('help')
    expect(findUtilityCommandByInput('/history --all')?.id).toBe('history_all')
    expect(findUtilityCommandByInput('/diag --json')?.id).toBe('diag_json')
    expect(findUtilityCommandByInput('/clear-history')?.id).toBe('clear_history')
    expect(findUtilityCommandByInput('/memory --detailed')?.id).toBe('memory_detailed')
    expect(findUtilityCommandByInput('/why --json')?.id).toBe('why_json')
    expect(findUtilityCommandByInput('/consolidate-memory --auto')?.id).toBe('consolidate_memory_auto')
    expect(findUtilityCommandByInput('/model')?.id).toBe('model')
    expect(findUtilityCommandByInput('/model clear')?.id).toBe('model_clear')
    expect(findUtilityCommandByInput('/model set quality')?.id).toBe('model_set')
    expect(findUtilityCommandByInput('/model set')?.id).toBe('model_set')
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
    expect(exactTriggers).toContain('/memory')
    expect(exactTriggers).toContain('/model')
    expect(exactTriggers).not.toContain('/model set')

    expect(assistTriggers).toContain('/model set')
    expect(assistTriggers).toContain('/consolidate-memory')
    expect(assistTriggers.length).toBe(registry.length)
  })
})
