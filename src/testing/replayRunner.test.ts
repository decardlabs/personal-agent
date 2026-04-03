import { describe, expect, it } from 'vitest'
import { replayCases } from './replayCases.js'
import {
  extractEventTypes,
  runReplayCase,
  runReplaySuite,
} from './replayRunner.js'

describe('replay suite', () => {
  for (const testCase of replayCases) {
    it(`replays: ${testCase.name}`, async () => {
      const result = await runReplayCase(testCase)
      const responses = result.stepResults.map(step => step.response)

      expect(responses).toEqual(testCase.expectedResponses)

      if (testCase.expectedEventTypes) {
        const eventTypeMatrix = result.stepResults.map(step =>
          extractEventTypes(step.events),
        )
        expect(eventTypeMatrix).toEqual(testCase.expectedEventTypes)
      }
    })
  }

  it('generates replay summary statistics', async () => {
    const summary = await runReplaySuite(replayCases)

    expect(summary.totalCases).toBe(replayCases.length)
    expect(summary.passedCases).toBe(replayCases.length)
    expect(summary.failedCases).toBe(0)
    expect(summary.passRate).toBe(100)
    expect(summary.totalTurns).toBeGreaterThan(0)
    expect(summary.memoryOpportunityTurns).toBeGreaterThanOrEqual(0)
    expect(summary.memoryHitTurns).toBeGreaterThanOrEqual(0)
    expect(summary.memoryHitRate).toBeGreaterThanOrEqual(0)
    expect(summary.wrongMemoryHitTurns).toBeGreaterThanOrEqual(0)
    expect(summary.wrongMemoryHitRate).toBeGreaterThanOrEqual(0)
    expect(summary.emptyMemoryHitTurns).toBeGreaterThanOrEqual(0)
    expect(summary.emptyMemoryHitRate).toBeGreaterThanOrEqual(0)
    expect(summary.averageElapsedMs).toBeGreaterThanOrEqual(0)
    expect(summary.failureBreakdown.assertion_mismatch).toBe(0)
    expect(summary.failureBreakdown.unexpected_error).toBe(0)
  })

  it('classifies replay assertion mismatches in summary', async () => {
    const firstCase = replayCases[0]
    if (!firstCase) {
      throw new Error('Expected at least one replay case')
    }

    const brokenCase = {
      ...firstCase,
      name: 'broken-response-case',
      expectedResponses: ['not-the-real-response'],
    }

    const summary = await runReplaySuite([brokenCase])

    expect(summary.totalCases).toBe(1)
    expect(summary.passedCases).toBe(0)
    expect(summary.failedCases).toBe(1)
    expect(summary.totalTurns).toBe(1)
    expect(summary.failureBreakdown.assertion_mismatch).toBe(1)
    expect(summary.cases[0]?.failureReason).toBe('assertion_mismatch')
  })
})
