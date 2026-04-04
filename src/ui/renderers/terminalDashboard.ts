import type { FeatureFlag } from '../../featureFlags.js'
import type { MemoryDiagnostics } from '../../memory/memoryCoordinator.js'
import type { ManagedLLMConfig } from '../../llm/modelManagement.js'
import type { UIStateSnapshot } from '../state.js'
import { getUIStatusSummary } from '../selectors.js'
import { resolveSummaryWeightProfileName, resolveSummaryWeights } from './dashboardWeightProfiles.js'
import { orderSummaryItems, resolveSummaryOrderingPolicyName } from './summaryOrderingPolicy.js'
import { formatSummaryCellContent, getSummaryTruncationPolicyName, truncateWithEllipsis } from './summaryTruncationPolicy.js'

export type TerminalDashboardInput = {
  sessionId: string | null
  cwd: string
  featureFlags: ReadonlySet<FeatureFlag>
  diagnostics: MemoryDiagnostics
  llmConfigSnapshot: ManagedLLMConfig | null
  uiState: UIStateSnapshot
  mode?: 'standard' | 'compact' | 'detailed'
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + ' '.repeat(width - text.length)
}

function truncate(text: string, width: number): string {
  return truncateWithEllipsis(text, width)
}

function fullWidthLine(value: string, width: number): string {
  return `| ${pad(truncate(value, width - 4), width - 4)} |`
}

function splitWeightedWidths(totalWidth: number, weights: number[]): number[] {
  const safeWeights = weights.map(weight => (weight > 0 ? weight : 1))
  const totalWeight = safeWeights.reduce((sum, weight) => sum + weight, 0)
  const exact = safeWeights.map(weight => (totalWidth * weight) / totalWeight)
  const base = exact.map(value => Math.floor(value))
  const remainder = totalWidth - base.reduce((sum, value) => sum + value, 0)

  const withIndex = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction)

  for (let i = 0; i < remainder; i += 1) {
    const target = withIndex[i % withIndex.length]
    base[target.index] += 1
  }

  return base
}

function allocateSummaryCellWidths(totalWidth: number, items: Array<{ tag: string; weight: number }>): number[] {
  const minWidths = items.map(item => `[${item.tag}] `.length)
  const minTotal = minWidths.reduce((sum, value) => sum + value, 0)
  const weights = items.map(item => (item.weight > 0 ? item.weight : 1))

  if (minTotal >= totalWidth) {
    return splitWeightedWidths(totalWidth, weights)
  }

  const extra = splitWeightedWidths(
    totalWidth - minTotal,
    weights,
  )

  return minWidths.map((minWidth, index) => minWidth + extra[index])
}

function renderSummaryStrip(items: Array<{ tag: string; value: string; weight: number }>, width: number): string {
  const contentWidth = width - 4
  const separator = ' | '
  const availableWidth = contentWidth - separator.length * (items.length - 1)
  const cellWidths = allocateSummaryCellWidths(availableWidth, items)
  const cells = items.map((item, index) => pad(formatSummaryCellContent(item.tag, item.value, cellWidths[index]), cellWidths[index]))
  return `| ${cells.join(separator)} |`
}

type SummaryItem = {
  tag: string
  value: string
  priority: number
  weight: number
}

function getMemorySummaryTag(action: MemoryDiagnostics['recommendedAction']): string {
  if (action === 'ok') {
    return 'MEMORY:OK'
  }
  if (action === 'review') {
    return 'MEMORY:WARN'
  }
  return 'MEMORY:HOT'
}

function formatMemorySummaryValue(action: MemoryDiagnostics['recommendedAction']): string {
  if (action === 'ok') {
    return '.OK'
  }
  if (action === 'review') {
    return '!WARN'
  }
  return '!!HOT'
}

function shouldShowHotDetailedHint(action: MemoryDiagnostics['recommendedAction'], mode: NonNullable<TerminalDashboardInput['mode']>): boolean {
  return action === 'consolidate' && mode !== 'detailed'
}

function shouldShowStrategyDebug(flags: ReadonlySet<FeatureFlag>): boolean {
  return flags.has('verbose_diag')
}

function buildStrategySnapshot(
  mode: NonNullable<TerminalDashboardInput['mode']>,
  diagnostics: MemoryDiagnostics,
  llmConfigSnapshot: ManagedLLMConfig | null,
): { weightProfile: string; orderingPolicy: string; truncationPolicy: string } {
  return {
    weightProfile: resolveSummaryWeightProfileName(mode, diagnostics.recommendedAction, Boolean(llmConfigSnapshot?.fallbackModel)),
    orderingPolicy: resolveSummaryOrderingPolicyName(diagnostics.recommendedAction),
    truncationPolicy: getSummaryTruncationPolicyName(),
  }
}

function buildStrategyDebugLines(
  snapshot: { weightProfile: string; orderingPolicy: string; truncationPolicy: string },
  mode: NonNullable<TerminalDashboardInput['mode']>,
  width: number,
): string[] {
  const strategyJson = {
    s: 'strategy.v1',
    w: snapshot.weightProfile,
    o: snapshot.orderingPolicy,
    t: snapshot.truncationPolicy,
  }

  const strategyJsonVerbose = {
    schema: 'strategy.v1',
    weightProfile: snapshot.weightProfile,
    orderingPolicy: snapshot.orderingPolicy,
    truncationPolicy: snapshot.truncationPolicy,
  }

  const lines = [
    fullWidthLine(
      `strategy: weight=${snapshot.weightProfile} order=${snapshot.orderingPolicy} trunc=${snapshot.truncationPolicy}`,
      width,
    ),
    fullWidthLine(
      `strategy_json: ${JSON.stringify(strategyJson)}`,
      width,
    ),
  ]

  if (mode === 'detailed') {
    lines.push(
      fullWidthLine(
        `strategy_json_verbose: ${JSON.stringify(strategyJsonVerbose)}`,
        width,
      ),
    )
  }

  return lines
}

function getSessionSummaryTag(sessionId: string | null): string {
  return sessionId ? 'SESSION:ACTIVE' : 'SESSION:NONE'
}

function formatSessionSummaryValue(sessionId: string | null): string {
  if (!sessionId) {
    return '-NONE'
  }
  return `+ACTIVE ${formatShortSession(sessionId)}`
}

function getModelSummaryTag(config: ManagedLLMConfig | null): string {
  if (!config) {
    return 'MODEL:OFF'
  }
  if (config.fallbackModel) {
    return 'MODEL:FALLBACK'
  }
  return 'MODEL:ON'
}

function formatModelSummaryValue(config: ManagedLLMConfig | null): string {
  if (!config) {
    return '-OFF'
  }
  if (config.fallbackModel) {
    return `~FALLBACK ${formatShortModel(config)}`
  }
  return `+ON ${formatShortModel(config)}`
}

function getViewSummaryTag(mode: NonNullable<TerminalDashboardInput['mode']>): string {
  return `VIEW:${mode.toUpperCase()}`
}

function formatViewSummaryValue(mode: NonNullable<TerminalDashboardInput['mode']>): string {
  if (mode === 'standard') {
    return '=STANDARD'
  }
  if (mode === 'compact') {
    return '~COMPACT'
  }
  return '+DETAILED'
}

function formatShortSession(sessionId: string | null): string {
  if (!sessionId) {
    return '(none)'
  }
  if (sessionId.length <= 14) {
    return sessionId
  }
  return `...${sessionId.slice(-11)}`
}

function formatShortModel(config: ManagedLLMConfig | null): string {
  if (!config) {
    return '(none)'
  }
  return `${config.model}@${config.source}`
}

function getMemoryPriority(action: MemoryDiagnostics['recommendedAction']): number {
  if (action === 'consolidate') {
    return 1000
  }
  if (action === 'review') {
    return 320
  }
  return 220
}

function buildSummaryItems(input: TerminalDashboardInput, mode: NonNullable<TerminalDashboardInput['mode']>): SummaryItem[] {
  const sessionId = input.sessionId
  const model = input.llmConfigSnapshot
  const memoryAction = input.diagnostics.recommendedAction
  const weights = resolveSummaryWeights(mode, memoryAction, Boolean(model?.fallbackModel))

  const items: SummaryItem[] = [
    {
      tag: getMemorySummaryTag(memoryAction),
      value: formatMemorySummaryValue(memoryAction),
      priority: getMemoryPriority(memoryAction),
      weight: weights.memory,
    },
    {
      tag: getModelSummaryTag(model),
      value: formatModelSummaryValue(model),
      priority: model?.fallbackModel ? 360 : model ? 300 : 120,
      weight: weights.model,
    },
    {
      tag: getSessionSummaryTag(sessionId),
      value: formatSessionSummaryValue(sessionId),
      priority: sessionId ? 240 : 100,
      weight: weights.session,
    },
    {
      tag: getViewSummaryTag(mode),
      value: formatViewSummaryValue(mode),
      priority: 80,
      weight: weights.view,
    },
  ]

  return orderSummaryItems(items, memoryAction)
}

function sectionLine(label: string, value: string, width: number, labelWidth = 14): string {
  const contentWidth = width - 4
  const formatted = label
    ? `${pad(truncate(label, labelWidth), labelWidth)} ${truncate(value, contentWidth - labelWidth - 1)}`
    : ''
  return `| ${pad(formatted, contentWidth)} |`
}

function sectionTitle(title: string, width: number): string {
  return `| ${pad(`[${title}]`, width - 4)} |`
}

function border(width: number): string {
  return `+${'-'.repeat(width - 2)}+`
}

function blankLine(width: number): string {
  return sectionLine('', '', width)
}

function renderPanel(
  title: string,
  rows: Array<{ label: string; value: string }>,
  width: number,
  minRows = rows.length,
): string[] {
  const paddedRows = rows.length >= minRows
    ? rows
    : [...rows, ...Array.from({ length: minRows - rows.length }, () => ({ label: '', value: '' }))]

  return [
    border(width),
    sectionTitle(title, width),
    ...paddedRows.map(row => row.label || row.value ? sectionLine(row.label, row.value, width) : blankLine(width)),
    border(width),
  ]
}

function combinePanels(left: string[], right: string[]): string[] {
  const maxLines = Math.max(left.length, right.length)
  const leftWidth = left[0]?.length ?? 0
  const rightWidth = right[0]?.length ?? 0
  const blankLeft = ' '.repeat(leftWidth)
  const blankRight = ' '.repeat(rightWidth)

  return Array.from({ length: maxLines }, (_, index) => `${left[index] ?? blankLeft} ${right[index] ?? blankRight}`)
}

const SECTION_MIN_ROWS: Record<NonNullable<TerminalDashboardInput['mode']>, {
  overview: number
  runtime: number
  memory: number
  llm: number
}> = {
  standard: {
    overview: 4,
    runtime: 6,
    memory: 6,
    llm: 6,
  },
  compact: {
    overview: 3,
    runtime: 3,
    memory: 3,
    llm: 3,
  },
  detailed: {
    overview: 5,
    runtime: 9,
    memory: 7,
    llm: 6,
  },
}

export function renderTerminalDashboard(input: TerminalDashboardInput): string {
  const ui = getUIStatusSummary(input.uiState)
  const flags = [...input.featureFlags]
  const flagSet = input.featureFlags
  const mode = input.mode ?? 'standard'
  const panelWidth = 46
  const dashboardWidth = panelWidth * 2 + 1
  const top = border(dashboardWidth)
  const summaryItems = buildSummaryItems(input, mode)
  const summaryStrip = renderSummaryStrip(summaryItems, dashboardWidth)
  const strategySnapshot = buildStrategySnapshot(mode, input.diagnostics, input.llmConfigSnapshot)
  const strategyLine = shouldShowStrategyDebug(flagSet)
    ? buildStrategyDebugLines(strategySnapshot, mode, dashboardWidth)
    : []

  const overviewRows = [
    { label: 'session', value: input.sessionId ?? '(none)' },
    { label: 'cwd', value: input.cwd },
    { label: 'ui mode', value: ui.mode },
    { label: 'last input', value: ui.lastInput ?? '(none)' },
  ]

  const runtimeRows = [
    { label: 'feature flags', value: flags.length > 0 ? flags.join(', ') : '(none)' },
    { label: 'notifications', value: `${ui.notifications.count} (${ui.notifications.latestLevel ?? 'none'})` },
    { label: 'latest notice', value: ui.notifications.latestMessage ?? '(none)' },
    { label: 'last command', value: ui.lastCommand?.commandId ?? ui.lastCommand?.input ?? '(none)' },
    { label: 'last turn', value: ui.lastTurn?.turnId ?? '(none)' },
    { label: 'last response', value: ui.lastTurn?.responsePreview ?? '(none)' },
  ]

  const memoryRows = [
    { label: 'memory action', value: input.diagnostics.recommendedAction },
    { label: 'history turns', value: String(input.diagnostics.historyTurns) },
    { label: 'persistent facts', value: String(input.diagnostics.persistentFactCount) },
    { label: 'stale facts', value: String(input.diagnostics.staleFactCount) },
    { label: 'low-conf facts', value: String(input.diagnostics.lowConfidenceFactCount) },
    { label: 'avg confidence', value: input.diagnostics.averageFactConfidence.toFixed(2) },
    { label: 'write decisions', value: `${input.diagnostics.writeDecisionsTotal} (${(input.diagnostics.writeDecisionAcceptanceRate * 100).toFixed(0)}% accepted)` },
  ]

  const llmRows = [
    { label: 'status', value: input.llmConfigSnapshot ? 'enabled' : 'disabled' },
    { label: 'model', value: input.llmConfigSnapshot ? `${input.llmConfigSnapshot.model} via ${input.llmConfigSnapshot.source}` : '(none)' },
    { label: 'fallback', value: input.llmConfigSnapshot?.fallbackModel ?? '(none)' },
  ]

  if (mode === 'compact') {
    const topRows = Math.max(SECTION_MIN_ROWS.compact.overview, SECTION_MIN_ROWS.compact.runtime)
    const bottomRows = Math.max(SECTION_MIN_ROWS.compact.memory, SECTION_MIN_ROWS.compact.llm)

    const compactOverview = renderPanel('Overview', [
      overviewRows[0],
      overviewRows[2],
      { label: 'last command', value: ui.lastCommand?.commandId ?? ui.lastCommand?.input ?? '(none)' },
    ], panelWidth, topRows)
    const compactRuntime = renderPanel('Runtime', [
      { label: 'flags', value: flags.length > 0 ? flags.join(', ') : '(none)' },
      { label: 'notice', value: ui.notifications.latestMessage ?? '(none)' },
    ], panelWidth, topRows)
    const compactMemory = renderPanel('Memory', [
      memoryRows[0],
      memoryRows[2],
      memoryRows[5],
    ], panelWidth, bottomRows)
    const compactLlm = renderPanel('LLM', [
      llmRows[0],
      llmRows[1],
    ], panelWidth, bottomRows)

    const hint = shouldShowHotDetailedHint(input.diagnostics.recommendedAction, mode)
      ? [fullWidthLine('Hint: memory is HOT. Use /dashboard --detailed for deeper diagnostics.', dashboardWidth)]
      : []

    return [
      top,
      fullWidthLine('Dashboard: Personal Assistant TUI MVP (compact)', dashboardWidth),
      summaryStrip,
      ...strategyLine,
      ...hint,
      top,
      ...combinePanels(compactOverview, compactRuntime),
      ...combinePanels(compactMemory, compactLlm),
      top,
    ].join('\n')
  }

  if (mode === 'detailed') {
    overviewRows.push(
      { label: 'last error', value: input.uiState.lastError ?? '(none)' },
    )
    runtimeRows.push(
      { label: 'last cmd input', value: input.uiState.lastCommand?.input ?? '(none)' },
      { label: 'last cmd time', value: input.uiState.lastCommand?.createdAt ?? '(none)' },
      { label: 'turn events', value: String(input.uiState.lastTurn?.eventCount ?? 0) },
    )
    memoryRows.splice(1, 0,
      { label: 'preferences', value: String(input.diagnostics.preferenceCount) },
    )
    llmRows.push(
      { label: 'timeout ms', value: input.llmConfigSnapshot ? String(input.llmConfigSnapshot.timeoutMs) : '(none)' },
      { label: 'max retries', value: input.llmConfigSnapshot ? String(input.llmConfigSnapshot.maxRetries) : '(none)' },
      { label: 'decision log', value: input.llmConfigSnapshot?.decisionLog.join(' | ') ?? '(none)' },
    )
  }

  const layout = SECTION_MIN_ROWS[mode]
  const topRows = Math.max(layout.overview, layout.runtime)
  const bottomRows = Math.max(layout.memory, layout.llm)
  const overview = renderPanel('Overview', overviewRows, panelWidth, topRows)
  const runtime = renderPanel('Runtime', runtimeRows, panelWidth, topRows)
  const memory = renderPanel('Memory', memoryRows, panelWidth, bottomRows)
  const llm = renderPanel('LLM', llmRows, panelWidth, bottomRows)

  const lines = [
    top,
    fullWidthLine(
      mode === 'detailed'
        ? 'Dashboard: Personal Assistant TUI MVP (detailed)'
        : 'Dashboard: Personal Assistant TUI MVP',
      dashboardWidth,
    ),
    summaryStrip,
    ...strategyLine,
    ...(shouldShowHotDetailedHint(input.diagnostics.recommendedAction, mode)
      ? [fullWidthLine('Hint: memory is HOT. Use /dashboard --detailed for deeper diagnostics.', dashboardWidth)]
      : []),
    top,
    ...combinePanels(overview, runtime),
    ...combinePanels(memory, llm),
    top,
  ]

  return lines.join('\n')
}
