import type { FeatureFlag } from '../../featureFlags.js'
import type { MemoryDiagnostics } from '../../memory/memoryCoordinator.js'
import type { ManagedLLMConfig } from '../../llm/modelManagement.js'
import type { UIStateSnapshot } from '../state.js'
import { getUIStatusSummary } from '../selectors.js'

export type TerminalDashboardInput = {
  sessionId: string | null
  cwd: string
  featureFlags: ReadonlySet<FeatureFlag>
  diagnostics: MemoryDiagnostics
  llmConfigSnapshot: ManagedLLMConfig | null
  uiState: UIStateSnapshot
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

function truncate(text: string, width: number): string {
  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 3))}...`
}

function line(label: string, value: string, width = 72): string {
  return `| ${pad(label, 18)} ${pad(truncate(value, width - 23), width - 23)} |`
}

function sectionTitle(title: string, width = 72): string {
  return `| ${pad(`[${title}]`, width - 2)} |`
}

function separator(width = 72): string {
  return `| ${'-'.repeat(width - 2)} |`
}

function renderSection(title: string, rows: Array<{ label: string; value: string }>, width = 72): string[] {
  return [
    sectionTitle(title, width),
    ...rows.map(row => line(row.label, row.value, width)),
    separator(width),
  ]
}

export function renderTerminalDashboard(input: TerminalDashboardInput): string {
  const ui = getUIStatusSummary(input.uiState)
  const flags = [...input.featureFlags]
  const width = 72
  const top = `+${'-'.repeat(width)}+`

  const overview = renderSection('Overview', [
    { label: 'session', value: input.sessionId ?? '(none)' },
    { label: 'cwd', value: input.cwd },
    { label: 'ui mode', value: ui.mode },
    { label: 'last input', value: ui.lastInput ?? '(none)' },
  ], width)

  const runtime = renderSection('Runtime', [
    { label: 'feature flags', value: flags.length > 0 ? flags.join(', ') : '(none)' },
    { label: 'notifications', value: `${ui.notifications.count} (${ui.notifications.latestLevel ?? 'none'})` },
    { label: 'latest notice', value: ui.notifications.latestMessage ?? '(none)' },
    { label: 'last command', value: ui.lastCommand?.commandId ?? ui.lastCommand?.input ?? '(none)' },
    { label: 'last turn', value: ui.lastTurn?.turnId ?? '(none)' },
    { label: 'last response', value: ui.lastTurn?.responsePreview ?? '(none)' },
  ], width)

  const memory = renderSection('Memory', [
    { label: 'memory action', value: input.diagnostics.recommendedAction },
    { label: 'history turns', value: String(input.diagnostics.historyTurns) },
    { label: 'persistent facts', value: String(input.diagnostics.persistentFactCount) },
    { label: 'stale facts', value: String(input.diagnostics.staleFactCount) },
    { label: 'low-conf facts', value: String(input.diagnostics.lowConfidenceFactCount) },
    { label: 'avg confidence', value: input.diagnostics.averageFactConfidence.toFixed(2) },
  ], width)

  const llm = renderSection('LLM', [
    { label: 'status', value: input.llmConfigSnapshot ? 'enabled' : 'disabled' },
    { label: 'model', value: input.llmConfigSnapshot ? `${input.llmConfigSnapshot.model} via ${input.llmConfigSnapshot.source}` : '(none)' },
    { label: 'fallback', value: input.llmConfigSnapshot?.fallbackModel ?? '(none)' },
  ], width)

  const lines = [
    top,
    line('Dashboard', 'Personal Assistant TUI MVP', width),
    top,
    ...overview,
    ...runtime,
    ...memory,
    ...llm,
    top,
  ]

  return lines.join('\n')
}
