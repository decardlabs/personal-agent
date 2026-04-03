import { describe, expect, it } from 'vitest'
import {
  getClosestCommandSuggestion,
  getCompletionSuggestions,
  isKnownCommandInput,
} from './commandAssist.js'

describe('commandAssist', () => {
  it('detects known commands', () => {
    expect(isKnownCommandInput('echo hello')).toBe(true)
    expect(isKnownCommandInput('/why --json')).toBe(true)
    expect(isKnownCommandInput('set preference lang python')).toBe(true)
  })

  it('returns prefix-based completion suggestions', () => {
    expect(getCompletionSuggestions('sear')).toContain('search')
    expect(getCompletionSuggestions('/m')).toContain('/memory')
  })

  it('returns closest typo suggestion', () => {
    expect(getClosestCommandSuggestion('recal last echo')).toBe('recall last echo')
    expect(getClosestCommandSuggestion('quitt')).toBe('quit')
  })
})
