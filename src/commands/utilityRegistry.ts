export type UtilityCommandSpec = {
  id:
  | 'help'
  | 'history'
  | 'history_all'
  | 'clear_history'
  | 'memory'
  | 'memory_detailed'
  | 'diag'
  | 'diag_json'
  | 'why'
  | 'why_json'
  | 'consolidate_memory'
  | 'consolidate_memory_auto'
  trigger: string
  description: string
}

const UTILITY_COMMAND_REGISTRY: UtilityCommandSpec[] = [
  {
    id: 'help',
    trigger: '/help',
    description: 'Show this help message',
  },
  {
    id: 'history',
    trigger: '/history',
    description: 'Show project history (session-first, deduped)',
  },
  {
    id: 'history_all',
    trigger: '/history --all',
    description: 'Show project history (latest 50, raw order)',
  },
  {
    id: 'clear_history',
    trigger: '/clear-history',
    description: 'Clear saved command history',
  },
  {
    id: 'memory',
    trigger: '/memory',
    description: 'Show current memory snapshot summary',
  },
  {
    id: 'memory_detailed',
    trigger: '/memory --detailed',
    description: 'Show summary with top persistent facts',
  },
  {
    id: 'diag',
    trigger: '/diag',
    description: 'Show runtime memory diagnostics',
  },
  {
    id: 'diag_json',
    trigger: '/diag --json',
    description: 'Output diagnostics in JSON for CI/gating',
  },
  {
    id: 'why',
    trigger: '/why',
    description: 'Explain memory signals used in the latest turn',
  },
  {
    id: 'why_json',
    trigger: '/why --json',
    description: 'Output latest memory-usage explanation in JSON',
  },
  {
    id: 'consolidate_memory',
    trigger: '/consolidate-memory',
    description: 'Prune stale low-confidence persistent memory',
  },
  {
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
  return UTILITY_COMMAND_REGISTRY.find(item => item.trigger === normalized) ?? null
}

export function getRegisteredUtilityTriggers(): string[] {
  return UTILITY_COMMAND_REGISTRY.map(item => item.trigger)
}
