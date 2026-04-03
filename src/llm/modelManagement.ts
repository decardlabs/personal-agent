export type ModelAlias = 'fast' | 'balanced' | 'quality'

export type ModelConfigSource = 'preference' | 'environment' | 'default'

export type ManagedLLMConfig = {
  model: string
  source: ModelConfigSource
  fallbackModel: string | null
  timeoutMs: number
  maxRetries: number
  temperature: number
  maxOutputTokens: number | null
}

const MODEL_ALIAS_MAP: Record<ModelAlias, string> = {
  fast: 'gpt-4o-mini',
  balanced: 'gpt-4o-mini',
  quality: 'gpt-4.1',
}

const DEFAULT_MODEL_ALIAS: ModelAlias = 'balanced'

function parseNumberEnv(value: string | undefined, defaultValue: number): number {
  if (!value) {
    return defaultValue
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return defaultValue
  }
  return parsed
}

function parseOptionalNumberEnv(value: string | undefined): number | null {
  if (!value) {
    return null
  }
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }
  if (parsed <= 0) {
    return null
  }
  return parsed
}

function normalizeModelName(raw: string): string {
  const value = raw.trim()
  const lower = value.toLowerCase()
  if (lower in MODEL_ALIAS_MAP) {
    return MODEL_ALIAS_MAP[lower as ModelAlias]
  }
  return value
}

function isValidModelValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function resolveManagedLLMConfig(input: {
  preferenceModel: string | null
  envModel?: string
  envFallbackModel?: string
  envTimeoutMs?: string
  envMaxRetries?: string
  envTemperature?: string
  envMaxOutputTokens?: string
}): ManagedLLMConfig {
  const modelFromPreference = isValidModelValue(input.preferenceModel)
    ? normalizeModelName(input.preferenceModel)
    : null
  const modelFromEnv = isValidModelValue(input.envModel)
    ? normalizeModelName(input.envModel)
    : null

  const model = modelFromPreference
    ?? modelFromEnv
    ?? MODEL_ALIAS_MAP[DEFAULT_MODEL_ALIAS]

  const source: ModelConfigSource = modelFromPreference
    ? 'preference'
    : modelFromEnv
      ? 'environment'
      : 'default'

  const fallback = isValidModelValue(input.envFallbackModel)
    ? normalizeModelName(input.envFallbackModel)
    : null

  return {
    model,
    source,
    fallbackModel: fallback && fallback !== model ? fallback : null,
    timeoutMs: Math.max(1000, parseNumberEnv(input.envTimeoutMs, 20000)),
    maxRetries: Math.max(0, Math.floor(parseNumberEnv(input.envMaxRetries, 1))),
    temperature: Math.min(1, Math.max(0, parseNumberEnv(input.envTemperature, 0.2))),
    maxOutputTokens: parseOptionalNumberEnv(input.envMaxOutputTokens),
  }
}

export function listModelAliasTable(): Array<{ alias: ModelAlias; model: string }> {
  return [
    { alias: 'fast', model: MODEL_ALIAS_MAP.fast },
    { alias: 'balanced', model: MODEL_ALIAS_MAP.balanced },
    { alias: 'quality', model: MODEL_ALIAS_MAP.quality },
  ]
}
