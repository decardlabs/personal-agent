import { describe, expect, it } from 'vitest'
import { orderSummaryItems, resolveSummaryOrderingPolicyName } from './summaryOrderingPolicy.js'

describe('summaryOrderingPolicy', () => {
  it('sorts by descending priority for non-hot memory actions', () => {
    const items = [
      { tag: 'VIEW:STANDARD', priority: 80 },
      { tag: 'MODEL:ON', priority: 300 },
      { tag: 'SESSION:ACTIVE', priority: 240 },
      { tag: 'MEMORY:WARN', priority: 320 },
    ]

    const ordered = orderSummaryItems(items, 'review')
    expect(ordered.map(item => item.tag)).toEqual([
      'MEMORY:WARN',
      'MODEL:ON',
      'SESSION:ACTIVE',
      'VIEW:STANDARD',
    ])
  })

  it('pins memory item first for consolidate action', () => {
    const items = [
      { tag: 'MODEL:FALLBACK', priority: 360 },
      { tag: 'SESSION:ACTIVE', priority: 240 },
      { tag: 'MEMORY:HOT', priority: 1000 },
      { tag: 'VIEW:STANDARD', priority: 80 },
    ]

    const ordered = orderSummaryItems(items, 'consolidate')
    expect(ordered[0]?.tag).toBe('MEMORY:HOT')
  })

  it('returns sorted order unchanged when no memory slot exists', () => {
    const items = [
      { tag: 'MODEL:ON', priority: 300 },
      { tag: 'SESSION:ACTIVE', priority: 240 },
      { tag: 'VIEW:STANDARD', priority: 80 },
    ]

    const ordered = orderSummaryItems(items, 'consolidate')
    expect(ordered.map(item => item.tag)).toEqual([
      'MODEL:ON',
      'SESSION:ACTIVE',
      'VIEW:STANDARD',
    ])
  })

  it('resolves ordering policy name by memory action', () => {
    expect(resolveSummaryOrderingPolicyName('ok')).toBe('priority')
    expect(resolveSummaryOrderingPolicyName('review')).toBe('priority')
    expect(resolveSummaryOrderingPolicyName('consolidate')).toBe('priority_hot_pin')
  })
})
