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
  | 'dashboard'
  | 'dashboard_compact'
  | 'dashboard_detailed'
  | 'status'
  | 'metrics_dream'
  | 'model'
  | 'model_clear'
  | 'model_set'
  | 'why'
  | 'why_json'
  | 'task'
  | 'task_run'
  | 'task_latest'
  | 'task_checkpoints'
  | 'task_resume'
  | 'consolidate_memory'
  | 'consolidate_memory_auto'
  | 'exit'
  | 'quit'
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
    command: '/dashboard',
    id: 'dashboard',
    trigger: '/dashboard',
    description: 'Render the read-only terminal dashboard snapshot',
  },
  {
    command: '/dashboard --compact',
    id: 'dashboard_compact',
    trigger: '/dashboard --compact',
    description: 'Render a compact dashboard snapshot',
  },
  {
    command: '/dashboard --detailed',
    id: 'dashboard_detailed',
    trigger: '/dashboard --detailed',
    description: 'Render a detailed dashboard snapshot',
  },
  {
    command: '/status',
    id: 'status',
    trigger: '/status',
    description: 'Show runtime status for model, memory, permissions, and flags',
  },
  {
    command: '/metrics dream [--limit <n>] [--window <Nm|Nh|Nd>]',
    id: 'metrics_dream',
    trigger: '/metrics dream',
    description: 'Show memory-dream operational metrics (rates, reason codes, writes)',
    matchMode: 'prefix',
    assistTrigger: '/metrics dream',
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
    command: '/task',
    id: 'task',
    trigger: '/task',
    description: 'Show recent task checkpoints for current session',
  },
  {
    command: '/task run <step1> => <step2>',
    id: 'task_run',
    trigger: '/task run',
    description: 'Run staged plans; supports branches and positive/negative conditional edges (contains/notContains, equals/notEquals, matches/notMatches)',
    matchMode: 'prefix',
    assistTrigger: '/task run',
  },
  {
    command: '/task latest',
    id: 'task_latest',
    trigger: '/task latest',
    description: 'Show the latest task and its latest checkpoint',
  },
  {
    command: '/task checkpoints <taskId>',
    id: 'task_checkpoints',
    trigger: '/task checkpoints',
    description: 'Show checkpoints for a specific task id',
    matchMode: 'prefix',
    assistTrigger: '/task checkpoints',
  },
  {
    command: '/task resume <taskId>',
    id: 'task_resume',
    trigger: '/task resume',
    description: 'Resume task execution from the latest checkpoint',
    matchMode: 'prefix',
    assistTrigger: '/task resume',
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
  {
    command: 'exit',
    id: 'exit',
    trigger: 'exit',
    description: 'Leave interactive mode',
  },
  {
    command: 'quit',
    id: 'quit',
    trigger: 'quit',
    description: 'Leave interactive mode',
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

export function validateUtilityCommandRegistry(): string[] {
  const errors: string[] = []
  const seen = new Set<string>()

  for (const item of UTILITY_COMMAND_REGISTRY) {
    const mode = item.matchMode ?? 'exact'
    const key = `${mode}:${item.trigger}`
    if (seen.has(key)) {
      errors.push(`duplicate trigger for ${key}`)
      continue
    }
    seen.add(key)
  }

  const exact = UTILITY_COMMAND_REGISTRY.filter(item => (item.matchMode ?? 'exact') === 'exact')
  const prefix = UTILITY_COMMAND_REGISTRY.filter(item => (item.matchMode ?? 'exact') === 'prefix')

  for (const p of prefix) {
    for (const e of exact) {
      if (e.trigger === p.trigger) {
        errors.push(`ambiguous exact/prefix overlap: ${e.trigger} <-> ${p.trigger}`)
      }
    }
  }

  for (const p of prefix) {
    for (const other of prefix) {
      if (p.id === other.id) {
        continue
      }
      if (p.trigger === other.trigger || p.trigger.startsWith(`${other.trigger} `) || other.trigger.startsWith(`${p.trigger} `)) {
        errors.push(`ambiguous prefix overlap: ${p.trigger} <-> ${other.trigger}`)
      }
    }
  }

  return errors
}
