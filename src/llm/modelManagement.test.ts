import { describe, expect, it } from 'vitest'
import {
  getAllowedModels,
  listModelAliasTable,
  resolveManagedLLMConfig,
  validateAndNormalizePreferredModel,
} from './modelManagement.js'

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

  it('validates and resolves alias model input', () => {
    const result = validateAndNormalizePreferredModel('quality')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.normalizedModel).toBe('gpt-4.1')
      expect(result.resolvedFromAlias).toBe(true)
    }
  })

  it('rejects disallowed model with explainable suggestions', () => {
    const result = validateAndNormalizePreferredModel('gpt-5', {
      envAllowedModels: 'gpt-4o-mini,gpt-4.1',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('disallowed')
      expect(result.suggestions).toEqual(['gpt-4o-mini', 'gpt-4.1'])
    }
  })

  it('returns allowed models from env policy or defaults', () => {
    expect(getAllowedModels('gpt-4.1,fast')).toEqual(['gpt-4.1', 'gpt-4o-mini'])
    expect(getAllowedModels(undefined).length).toBeGreaterThan(0)
  })

  it('decisionLog documents preference alias resolution', () => {
    const cfg = resolveManagedLLMConfig({
      preferenceModel: 'quality',
    })
    expect(cfg.decisionLog[0]).toContain("user preference")
    expect(cfg.decisionLog[0]).toContain("quality")
    expect(cfg.decisionLog[0]).toContain("gpt-4.1")
    expect(cfg.decisionLog[1]).toBe('fallback: none')
  })

  it('decisionLog documents env model and configured fallback', () => {
    const cfg = resolveManagedLLMConfig({
      preferenceModel: null,
      envModel: 'gpt-4o',
      envFallbackModel: 'gpt-4o-mini',
    })
    expect(cfg.decisionLog[0]).toContain("env variable")
    expect(cfg.decisionLog[0]).toContain("gpt-4o")
    expect(cfg.decisionLog[1]).toContain("fallback: 'gpt-4o-mini' configured")
  })

  it('decisionLog documents default alias when no override is set', () => {
    const cfg = resolveManagedLLMConfig({ preferenceModel: null })
    expect(cfg.decisionLog[0]).toContain("default alias")
    expect(cfg.decisionLog[0]).toContain("balanced")
    expect(cfg.decisionLog[1]).toBe('fallback: none')
  })
})
