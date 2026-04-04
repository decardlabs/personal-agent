import { describe, expect, it } from 'vitest'
import {
  resolveSummaryWeightProfileName,
  SUMMARY_WEIGHT_PROFILES,
  resolveSummaryWeights,
} from './dashboardWeightProfiles.js'

describe('dashboardWeightProfiles', () => {
  it('returns base profile for non-hot standard/compact modes', () => {
    expect(resolveSummaryWeights('standard', 'ok', false)).toEqual(SUMMARY_WEIGHT_PROFILES.base)
    expect(resolveSummaryWeights('compact', 'review', true)).toEqual(SUMMARY_WEIGHT_PROFILES.base)
  })

  it('returns detailed profile for detailed mode when memory is not hot', () => {
    expect(resolveSummaryWeights('detailed', 'ok', false)).toEqual(SUMMARY_WEIGHT_PROFILES.detailed)
    expect(resolveSummaryWeights('detailed', 'review', true)).toEqual(SUMMARY_WEIGHT_PROFILES.detailed)
  })

  it('returns hot profiles for consolidate action with and without fallback', () => {
    expect(resolveSummaryWeights('standard', 'consolidate', false)).toEqual(SUMMARY_WEIGHT_PROFILES.hot)
    expect(resolveSummaryWeights('detailed', 'consolidate', true)).toEqual(SUMMARY_WEIGHT_PROFILES.hotWithFallback)
  })

  it('resolves profile names consistently with selected profile', () => {
    expect(resolveSummaryWeightProfileName('standard', 'ok', false)).toBe('base')
    expect(resolveSummaryWeightProfileName('detailed', 'review', false)).toBe('detailed')
    expect(resolveSummaryWeightProfileName('compact', 'consolidate', false)).toBe('hot')
    expect(resolveSummaryWeightProfileName('compact', 'consolidate', true)).toBe('hotWithFallback')
  })
})
