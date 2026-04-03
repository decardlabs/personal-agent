export type UtilityCommandSpec = {
  command: string
  id:
  | 'help'
  | 'history'
  | 'history_all'
  | 'clear_history'
  | 'memory'
  | 'memory_detailed'
  | 'diag'
  | 'diag_json'
  | 'model'
  | 'model_clear'
  | 'model_set'
  | 'why'
  | 'why_json'
  | 'consolidate_memory'
  | 'consolidate_memory_auto'
  trigger: string
  description: string
  matchMode?: 'exact' | 'prefix'
  assistTrigger?: string
}

const UTILITY_COMMAND_REGISTRY: UtilityCommandSpec[] = [
  {
    command: '/help',
    id: 'help',
    trigger: '/help',
    description: 'Show this help message',
  },
  {
    command: '/history',
    id: 'history',
    trigger: '/history',
    description: 'Show project history (session-first, deduped)',
  },
  {
    command: '/history --all',
    id: 'history_all',
    trigger: '/history --all',
    description: 'Show project history (latest 50, raw order)',
  },
  {
    command: '/clear-history',
    id: 'clear_history',
    trigger: '/clear-history',
    description: 'Clear saved command history',
  },
  {
    command: '/memory',
    id: 'memory',
    trigger: '/memory',
    description: 'Show current memory snapshot summary',
  },
  {
    command: '/memory --detailed',
    id: 'memory_detailed',
    trigger: '/memory --detailed',
    description: 'Show summary with top persistent facts',
  },
  {
    command: '/diag',
    id: 'diag',
    trigger: '/diag',
    description: 'Show runtime memory diagnostics',
  },
  {
    command: '/diag --json',
    id: 'diag_json',
    trigger: '/diag --json',
    description: 'Output diagnostics in JSON for CI/gating',
  },
  {
    command: '/model',
    id: 'model',
    trigger: '/model',
    description: 'Show active LLM model policy and alias table',
  },
  {
    command: '/model clear',
    id: 'model_clear',
    trigger: '/model clear',
    description: 'Clear preferred LLM model',
  },
  {
    command: '/model set <model>',
    id: 'model_set',
    trigger: '/model set',
    description: 'Set preferred LLM model or alias (fast/balanced/quality)',
    matchMode: 'prefix',
    assistTrigger: '/model set',
  },
  {
    command: '/why',
    id: 'why',
    trigger: '/why',
    description: 'Explain memory signals used in the latest turn',
  },
  {
    command: '/why --json',
    id: 'why_json',
    trigger: '/why --json',
    description: 'Output latest memory-usage explanation in JSON',
  },
  {
    command: '/consolidate-memory',
    id: 'consolidate_memory',
    trigger: '/consolidate-memory',
    description: 'Prune stale low-confidence persistent memory',
  },
  {
    command: '/consolidate-memory --auto',
    id: 'consolidate_memory_auto',
    trigger: '/consolidate-memory --auto',
    description: 'Consolidate only when diagnostics suggest it',
  },
]

export function getUtilityCommandRegistry(): UtilityCommandSpec[] {
  return [...UTILITY_COMMAND_REGISTRY]
}

export function findUtilityCommandByInput(input: string): UtilityCommandSpec | null {
  const normalized = input.trim().toLowerCase()

  const exact = UTILITY_COMMAND_REGISTRY.find(item => (item.matchMode ?? 'exact') === 'exact' && item.trigger === normalized)
  if (exact) {
    return exact
  }

  return UTILITY_COMMAND_REGISTRY.find(
    item => (item.matchMode ?? 'exact') === 'prefix' && (normalized === item.trigger || normalized.startsWith(`${item.trigger} `)),
  ) ?? null
}

export function getRegisteredUtilityExactTriggers(): string[] {
  return UTILITY_COMMAND_REGISTRY
    .filter(item => (item.matchMode ?? 'exact') === 'exact')
    .map(item => item.trigger)
}

export function getRegisteredUtilityAssistTriggers(): string[] {
  return UTILITY_COMMAND_REGISTRY.map(item => item.trigger)
}
