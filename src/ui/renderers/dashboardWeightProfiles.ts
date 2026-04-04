import type { MemoryDiagnostics } from '../../memory/memoryCoordinator.js'

export type DashboardViewMode = 'standard' | 'compact' | 'detailed'
export type SummarySlot = 'memory' | 'model' | 'session' | 'view'
export type SummaryWeightProfile = Record<SummarySlot, number>
export type SummaryWeightProfileName = 'base' | 'detailed' | 'hot' | 'hotWithFallback'

export const SUMMARY_WEIGHT_PROFILES: {
  base: SummaryWeightProfile
  detailed: SummaryWeightProfile
  hot: SummaryWeightProfile
  hotWithFallback: SummaryWeightProfile
} = {
  base: {
    memory: 4,
    model: 4,
    session: 3,
    view: 2,
  },
  detailed: {
    memory: 4,
    model: 4,
    session: 3,
    view: 3,
  },
  hot: {
    memory: 6,
    model: 5,
    session: 2,
    view: 1,
  },
  hotWithFallback: {
    memory: 6,
    model: 6,
    session: 2,
    view: 1,
  },
}

export function resolveSummaryWeightProfileName(
  mode: DashboardViewMode,
  memoryAction: MemoryDiagnostics['recommendedAction'],
  hasFallback: boolean,
): SummaryWeightProfileName {
  if (memoryAction === 'consolidate') {
    return hasFallback ? 'hotWithFallback' : 'hot'
  }
  if (mode === 'detailed') {
    return 'detailed'
  }
  return 'base'
}

export function resolveSummaryWeights(
  mode: DashboardViewMode,
  memoryAction: MemoryDiagnostics['recommendedAction'],
  hasFallback: boolean,
): SummaryWeightProfile {
  const profile = resolveSummaryWeightProfileName(mode, memoryAction, hasFallback)
  return SUMMARY_WEIGHT_PROFILES[profile]
}
