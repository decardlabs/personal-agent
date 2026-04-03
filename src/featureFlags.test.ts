import { describe, expect, it } from 'vitest'
import { isFeatureEnabled, KNOWN_FEATURE_FLAGS, parseFeatureFlags } from './featureFlags.js'

describe('featureFlags', () => {
  it('returns empty set when FEATURE_FLAGS is undefined', () => {
    const flags = parseFeatureFlags(undefined)
    expect(flags.size).toBe(0)
  })

  it('returns empty set when FEATURE_FLAGS is empty string', () => {
    const flags = parseFeatureFlags('')
    expect(flags.size).toBe(0)
  })

  it('parses a single known flag', () => {
    const flags = parseFeatureFlags('verbose_diag')
    expect(flags.has('verbose_diag')).toBe(true)
    expect(flags.size).toBe(1)
  })

  it('parses multiple known flags separated by commas', () => {
    const flags = parseFeatureFlags('verbose_diag,llm_streaming')
    expect(flags.has('verbose_diag')).toBe(true)
    expect(flags.has('llm_streaming')).toBe(true)
    expect(flags.size).toBe(2)
  })

  it('trims whitespace around flag names', () => {
    const flags = parseFeatureFlags('  verbose_diag , llm_streaming  ')
    expect(flags.has('verbose_diag')).toBe(true)
    expect(flags.has('llm_streaming')).toBe(true)
  })

  it('silently ignores unknown flag names', () => {
    const flags = parseFeatureFlags('verbose_diag,totally_unknown_flag')
    expect(flags.has('verbose_diag')).toBe(true)
    expect(flags.size).toBe(1)
  })

  it('isFeatureEnabled returns true when flag is in set', () => {
    const flags = parseFeatureFlags('verbose_diag')
    expect(isFeatureEnabled('verbose_diag', flags)).toBe(true)
    expect(isFeatureEnabled('llm_streaming', flags)).toBe(false)
  })

  it('isFeatureEnabled returns false for all flags when set is empty', () => {
    const flags = new Set<'verbose_diag' | 'llm_streaming'>()
    for (const flag of KNOWN_FEATURE_FLAGS) {
      expect(isFeatureEnabled(flag, flags)).toBe(false)
    }
  })

  it('KNOWN_FEATURE_FLAGS contains at least verbose_diag and llm_streaming', () => {
    expect(KNOWN_FEATURE_FLAGS).toContain('verbose_diag')
    expect(KNOWN_FEATURE_FLAGS).toContain('llm_streaming')
  })
})
