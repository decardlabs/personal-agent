export type UtilityCommandSpec = {
  id: 'help' | 'history' | 'history_all' | 'diag' | 'diag_json'
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
    id: 'diag',
    trigger: '/diag',
    description: 'Show runtime memory diagnostics',
  },
  {
    id: 'diag_json',
    trigger: '/diag --json',
    description: 'Output diagnostics in JSON for CI/gating',
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
