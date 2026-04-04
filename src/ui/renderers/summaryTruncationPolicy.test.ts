import { describe, expect, it } from 'vitest'
import {
  detectSummarySlot,
  formatSummaryCellContent,
  getSummaryTruncationPolicyName,
  truncateWithEllipsis,
} from './summaryTruncationPolicy.js'

describe('summaryTruncationPolicy', () => {
  it('detects summary slot from known tags', () => {
    expect(detectSummarySlot('MEMORY:WARN')).toBe('memory')
    expect(detectSummarySlot('MODEL:FALLBACK')).toBe('model')
    expect(detectSummarySlot('SESSION:ACTIVE')).toBe('session')
    expect(detectSummarySlot('VIEW:DETAILED')).toBe('view')
    expect(detectSummarySlot('OTHER')).toBe('unknown')
  })

  it('truncates with ellipsis behavior and tiny widths', () => {
    expect(truncateWithEllipsis('abcdef', 6)).toBe('abcdef')
    expect(truncateWithEllipsis('abcdef', 5)).toBe('ab...')
    expect(truncateWithEllipsis('abcdef', 2)).toBe('..')
    expect(truncateWithEllipsis('abcdef', 0)).toBe('')
  })

  it('formats summary cells with tag-first behavior and bounded width', () => {
    const rendered = formatSummaryCellContent('MODEL:ON', '+ON gpt-4o-mini@preference', 18)
    expect(rendered.length).toBeLessThanOrEqual(18)
    expect(rendered).toContain('[MODEL:ON]')

    const tiny = formatSummaryCellContent('VIEW:STANDARD', '=STANDARD', 8)
    expect(tiny.length).toBeLessThanOrEqual(8)
  })

  it('exposes truncation policy descriptor', () => {
    expect(getSummaryTruncationPolicyName()).toBe('slot_min_chars_v1')
  })
})
