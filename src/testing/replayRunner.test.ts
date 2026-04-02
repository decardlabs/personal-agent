import { describe, expect, it } from 'vitest'
import { replayCases } from './replayCases.js'
import { extractEventTypes, runReplayCase } from './replayRunner.js'

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
})
