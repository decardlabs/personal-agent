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

export function renderTerminalDashboard(input: TerminalDashboardInput): string {
  const ui = getUIStatusSummary(input.uiState)
  const flags = [...input.featureFlags]
  const width = 72
  const top = `+${'-'.repeat(width)}+`

  const lines = [
    top,
    line('Dashboard', 'Personal Assistant TUI MVP', width),
    top,
    line('session', input.sessionId ?? '(none)', width),
    line('cwd', input.cwd, width),
    line('ui mode', ui.mode, width),
    line('last input', ui.lastInput ?? '(none)', width),
    line('feature flags', flags.length > 0 ? flags.join(', ') : '(none)', width),
    line('notifications', `${ui.notifications.count} (${ui.notifications.latestLevel ?? 'none'})`, width),
    line('latest notice', ui.notifications.latestMessage ?? '(none)', width),
    line('last command', ui.lastCommand?.commandId ?? ui.lastCommand?.input ?? '(none)', width),
    line('last turn', ui.lastTurn?.turnId ?? '(none)', width),
    line('last response', ui.lastTurn?.responsePreview ?? '(none)', width),
    line('memory action', input.diagnostics.recommendedAction, width),
    line('history turns', String(input.diagnostics.historyTurns), width),
    line('persistent facts', String(input.diagnostics.persistentFactCount), width),
    line('llm', input.llmConfigSnapshot ? `${input.llmConfigSnapshot.model} via ${input.llmConfigSnapshot.source}` : 'disabled', width),
    top,
  ]

  return lines.join('\n')
}
