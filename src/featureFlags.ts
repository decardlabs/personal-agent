/**
 * Lightweight feature gate module.
 *
 * Enabled flags are read from the FEATURE_FLAGS environment variable as a
 * comma-separated list:
 *   FEATURE_FLAGS=verbose_diag,llm_streaming
 *
 * To add a new flag:
 *   1. Add its name to KNOWN_FEATURE_FLAGS below.
 *   2. Add it to the FeatureFlag union type.
 *   3. Call isFeatureEnabled('your_flag') where the behaviour should be gated.
 *
 * Flags are always opt-in: a flag does nothing unless explicitly listed in
 * FEATURE_FLAGS. The module is side-effect-free so it is safe to import
 * anywhere.
 */

export type FeatureFlag =
  /** Adds ranked facts list and active model config to /diag output */
  | 'verbose_diag'
  /** Reserved: streaming LLM responses (not yet implemented) */
  | 'llm_streaming'

export const KNOWN_FEATURE_FLAGS: readonly FeatureFlag[] = [
  'verbose_diag',
  'llm_streaming',
]

/**
 * Parses a raw FEATURE_FLAGS env string into a Set of flag names.
 * Unknown flag names are silently ignored so typos do not break startup.
 */
export function parseFeatureFlags(raw: string | undefined): Set<FeatureFlag> {
  if (!raw) {
    return new Set()
  }
  const enabled = new Set<FeatureFlag>()
  for (const token of raw.split(',')) {
    const trimmed = token.trim() as FeatureFlag
    if ((KNOWN_FEATURE_FLAGS as readonly string[]).includes(trimmed)) {
      enabled.add(trimmed)
    }
  }
  return enabled
}

/**
 * Returns true when `flag` is present in the parsed flags set.
 *
 * When called without `flags`, reads from process.env.FEATURE_FLAGS.
 * Pass an explicit Set when you want consistent behaviour within a request
 * (parse once at startup, share the Set).
 */
export function isFeatureEnabled(
  flag: FeatureFlag,
  flags?: ReadonlySet<FeatureFlag>,
): boolean {
  const resolved = flags ?? parseFeatureFlags(process.env.FEATURE_FLAGS)
  return resolved.has(flag)
}
