import { describe, expect, it } from 'vitest'
import {
  findUtilityCommandByInput,
  getRegisteredUtilityTriggers,
  getUtilityCommandRegistry,
} from './utilityRegistry.js'

describe('utilityRegistry', () => {
  it('finds registered commands by normalized input', () => {
    expect(findUtilityCommandByInput('/help')?.id).toBe('help')
    expect(findUtilityCommandByInput('/history --all')?.id).toBe('history_all')
    expect(findUtilityCommandByInput('/diag --json')?.id).toBe('diag_json')
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
    const triggers = getRegisteredUtilityTriggers()
    expect(triggers).toEqual(registry.map(item => item.trigger))
    expect(triggers).toContain('/help')
    expect(triggers).toContain('/diag --json')
  })
})
