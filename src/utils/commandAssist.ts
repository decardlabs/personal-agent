import { getRegisteredUtilityTriggers } from '../commands/utilityRegistry.js'

const CANONICAL_COMMANDS = [
  'echo',
  'search',
  'read',
  'set preference',
  'get preference',
  'recall last echo',
  ...getRegisteredUtilityTriggers(),
  '/clear-history',
  '/memory',
  '/memory --detailed',
  '/model',
  '/model set',
  '/model clear',
  '/why',
  '/consolidate-memory',
  '/consolidate-memory --auto',
  'exit',
  'quit',
]

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0),
  )

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      )
    }
  }

  return matrix[a.length][b.length]
}

export function isKnownCommandInput(input: string): boolean {
  const normalized = input.trim().toLowerCase()
  if (!normalized) return false
  const registeredUtilityTriggers = getRegisteredUtilityTriggers()

  if (
    normalized === 'recall last echo'
    || registeredUtilityTriggers.includes(normalized)
    || normalized === '/clear-history'
    || normalized === '/memory'
    || normalized === '/memory --detailed'
    || normalized === '/model'
    || normalized === '/model clear'
    || normalized === '/why'
    || normalized === '/why --json'
    || normalized === '/consolidate-memory'
    || normalized === '/consolidate-memory --auto'
    || normalized === 'exit'
    || normalized === 'quit'
  ) {
    return true
  }

  return (
    normalized.startsWith('echo ')
    || normalized.startsWith('search ')
    || normalized.startsWith('read ')
    || normalized.startsWith('read file ')
    || normalized.startsWith('set preference ')
    || normalized.startsWith('get preference ')
    || normalized.startsWith('/model set ')
  )
}

export function getCompletionSuggestions(input: string): string[] {
  const normalized = input.trim().toLowerCase()
  if (!normalized || normalized.includes(' ')) {
    return []
  }

  return CANONICAL_COMMANDS
    .filter(command => command.startsWith(normalized))
    .slice(0, 5)
}

export function getClosestCommandSuggestion(input: string): string | null {
  const normalized = input.trim().toLowerCase()
  if (!normalized) {
    return null
  }

  const candidate = CANONICAL_COMMANDS
    .map(command => ({
      command,
      distance: levenshtein(normalized, command),
    }))
    .sort((a, b) => a.distance - b.distance)[0]

  if (!candidate) {
    return null
  }

  return candidate.distance <= 3 ? candidate.command : null
}
