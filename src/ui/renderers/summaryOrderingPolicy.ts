import type { MemoryDiagnostics } from '../../memory/memoryCoordinator.js'

export type SummaryOrderItem = {
  tag: string
  priority: number
}

export type SummaryOrderingPolicyName = 'priority' | 'priority_hot_pin'

export function resolveSummaryOrderingPolicyName(
  memoryAction: MemoryDiagnostics['recommendedAction'],
): SummaryOrderingPolicyName {
  return memoryAction === 'consolidate' ? 'priority_hot_pin' : 'priority'
}

export function orderSummaryItems<T extends SummaryOrderItem>(
  items: T[],
  memoryAction: MemoryDiagnostics['recommendedAction'],
): T[] {
  const sorted = [...items].sort((a, b) => b.priority - a.priority)

  if (memoryAction !== 'consolidate') {
    return sorted
  }

  const memoryIndex = sorted.findIndex(item => item.tag.startsWith('MEMORY:'))
  if (memoryIndex <= 0) {
    return sorted
  }

  const [memoryItem] = sorted.splice(memoryIndex, 1)
  return [memoryItem, ...sorted]
}
