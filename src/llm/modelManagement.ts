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
  decisionLog: string[]
}

export type ModelValidationSuccess = {
  ok: true
  normalizedModel: string
  resolvedFromAlias: boolean
}

export type ModelValidationFailure = {
  ok: false
  reason: 'empty' | 'invalid_format' | 'disallowed'
  message: string
  suggestions: string[]
}

export type ModelValidationResult = ModelValidationSuccess | ModelValidationFailure

const MODEL_ALIAS_MAP: Record<ModelAlias, string> = {
  fast: 'gpt-4o-mini',
  balanced: 'gpt-4o-mini',
  quality: 'gpt-4.1',
}

const DEFAULT_MODEL_ALIAS: ModelAlias = 'balanced'
const DEFAULT_ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-4.1', 'gpt-4o']

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

function parseAllowedModelList(value: string | undefined): string[] {
  if (!value) {
    return [...DEFAULT_ALLOWED_MODELS]
  }

  const parsed = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(normalizeModelName)

  return parsed.length > 0 ? parsed : [...DEFAULT_ALLOWED_MODELS]
}

function looksLikeModelName(value: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{1,80}$/.test(value)
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
  const resolvedFallback = fallback && fallback !== model ? fallback : null

  const decisionLog: string[] = []
  if (modelFromPreference) {
    const rawPref = input.preferenceModel!.trim()
    const wasAlias = rawPref.toLowerCase() in MODEL_ALIAS_MAP
    decisionLog.push(
      wasAlias
        ? `model: user preference (alias '${rawPref}' → '${model}')`
        : `model: user preference ('${model}')`,
    )
  } else if (modelFromEnv) {
    const rawEnv = input.envModel!.trim()
    const wasAlias = rawEnv.toLowerCase() in MODEL_ALIAS_MAP
    decisionLog.push(
      wasAlias
        ? `model: env variable (alias '${rawEnv}' → '${model}')`
        : `model: env variable ('${model}')`,
    )
  } else {
    decisionLog.push(`model: default alias '${DEFAULT_MODEL_ALIAS}' ('${model}')`)
  }
  decisionLog.push(resolvedFallback ? `fallback: '${resolvedFallback}' configured` : 'fallback: none')

  return {
    model,
    source,
    fallbackModel: resolvedFallback,
    decisionLog,
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

export function getAllowedModels(envAllowedModels?: string): string[] {
  return parseAllowedModelList(envAllowedModels)
}

export function validateAndNormalizePreferredModel(
  input: string,
  options?: { envAllowedModels?: string },
): ModelValidationResult {
  const raw = input.trim()
  if (!raw) {
    return {
      ok: false,
      reason: 'empty',
      message: 'Model value is empty. Usage: /model set <alias|model-name>',
      suggestions: ['fast', 'balanced', 'quality'],
    }
  }

  if (!looksLikeModelName(raw)) {
    return {
      ok: false,
      reason: 'invalid_format',
      message: `Invalid model format: '${raw}'. Allowed characters: letters, numbers, '.', '_', ':', '-'.`,
      suggestions: ['gpt-4o-mini', 'gpt-4.1'],
    }
  }

  const normalized = normalizeModelName(raw)
  const allowedModels = parseAllowedModelList(options?.envAllowedModels)
  if (!allowedModels.includes(normalized)) {
    return {
      ok: false,
      reason: 'disallowed',
      message: `Model '${normalized}' is not allowed by OPENAI_ALLOWED_MODELS policy.`,
      suggestions: allowedModels.slice(0, 5),
    }
  }

  return {
    ok: true,
    normalizedModel: normalized,
    resolvedFromAlias: normalized.toLowerCase() !== raw.toLowerCase(),
  }
}

// ---------------------------------------------------------------------------
// Model preference migrations
// ---------------------------------------------------------------------------

export type ModelMigrationEntry = {
  /** Human-readable ID, used for dedup / logging (e.g. "rename-gpt-4-to-gpt-4o-mini") */
  id: string
  /** Exact saved value that is stale */
  staleValue: string
  /** Replacement value to write */
  replacementValue: string
  reason: string
}

export type ModelMigrationResult = {
  applied: boolean
  migrationId: string | null
  previousValue: string | null
  newValue: string | null
}

/**
 * Ordered list of model preference migrations.
 * Append new entries to the END — never reorder or remove existing entries.
 */
const MODEL_PREFERENCE_MIGRATIONS: ModelMigrationEntry[] = [
  {
    id: 'rename-gpt-4-to-gpt-4o-mini',
    staleValue: 'gpt-4',
    replacementValue: 'gpt-4o-mini',
    reason: 'gpt-4 was removed; mapped to gpt-4o-mini (balanced default)',
  },
  {
    id: 'rename-gpt-35-turbo-to-gpt-4o-mini',
    staleValue: 'gpt-3.5-turbo',
    replacementValue: 'gpt-4o-mini',
    reason: 'gpt-3.5-turbo is deprecated; mapped to gpt-4o-mini',
  },
]

/**
 * Checks the stored `llm_model` preference against the migration table.
 * If a stale value is found, rewrites it via `setPreference` and returns
 * a `ModelMigrationResult` describing what changed.
 *
 * Accepts duck-typed preference accessors so the caller does not need to
 * depend on a concrete class.
 */
export function applyModelPreferenceMigrations(preferences: {
  get(key: string): string | null
  set(key: string, value: string): void
}): ModelMigrationResult {
  const current = preferences.get('llm_model')
  if (!current) {
    return { applied: false, migrationId: null, previousValue: null, newValue: null }
  }

  for (const migration of MODEL_PREFERENCE_MIGRATIONS) {
    if (current === migration.staleValue) {
      preferences.set('llm_model', migration.replacementValue)
      return {
        applied: true,
        migrationId: migration.id,
        previousValue: migration.staleValue,
        newValue: migration.replacementValue,
      }
    }
  }

  return { applied: false, migrationId: null, previousValue: current, newValue: null }
}
