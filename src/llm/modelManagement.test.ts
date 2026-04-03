import { describe, expect, it } from 'vitest'
import { listModelAliasTable, resolveManagedLLMConfig } from './modelManagement.js'

describe('modelManagement', () => {
  it('uses preference model with highest priority', () => {
    const cfg = resolveManagedLLMConfig({
      preferenceModel: 'quality',
      envModel: 'gpt-4o-mini',
      envFallbackModel: 'fast',
    })

    expect(cfg.model).toBe('gpt-4.1')
    expect(cfg.source).toBe('preference')
    expect(cfg.fallbackModel).toBe('gpt-4o-mini')
  })

  it('falls back to env model then default', () => {
    const fromEnv = resolveManagedLLMConfig({
      preferenceModel: null,
      envModel: 'fast',
    })
    expect(fromEnv.model).toBe('gpt-4o-mini')
    expect(fromEnv.source).toBe('environment')

    const fromDefault = resolveManagedLLMConfig({
      preferenceModel: null,
    })
    expect(fromDefault.model).toBe('gpt-4o-mini')
    expect(fromDefault.source).toBe('default')
  })

  it('normalizes runtime controls and clamps invalid ranges', () => {
    const cfg = resolveManagedLLMConfig({
      preferenceModel: null,
      envTimeoutMs: '500',
      envMaxRetries: '-2',
      envTemperature: '2',
      envMaxOutputTokens: '0',
    })

    expect(cfg.timeoutMs).toBe(1000)
    expect(cfg.maxRetries).toBe(0)
    expect(cfg.temperature).toBe(1)
    expect(cfg.maxOutputTokens).toBeNull()
  })

  it('returns alias table for ui/help usage', () => {
    const table = listModelAliasTable()
    expect(table.length).toBe(3)
    expect(table.find(item => item.alias === 'quality')?.model).toBe('gpt-4.1')
  })
})
