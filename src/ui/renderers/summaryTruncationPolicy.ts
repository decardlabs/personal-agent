export type SummarySlot = 'memory' | 'model' | 'session' | 'view' | 'unknown'

type TruncationPolicy = {
  minValueChars: number
}

const SUMMARY_TRUNCATION_POLICIES: Record<SummarySlot, TruncationPolicy> = {
  memory: { minValueChars: 8 },
  model: { minValueChars: 8 },
  session: { minValueChars: 5 },
  view: { minValueChars: 3 },
  unknown: { minValueChars: 4 },
}

export function getSummaryTruncationPolicyName(): string {
  return 'slot_min_chars_v1'
}

export function detectSummarySlot(tag: string): SummarySlot {
  if (tag.startsWith('MEMORY:')) {
    return 'memory'
  }
  if (tag.startsWith('MODEL:')) {
    return 'model'
  }
  if (tag.startsWith('SESSION:')) {
    return 'session'
  }
  if (tag.startsWith('VIEW:')) {
    return 'view'
  }
  return 'unknown'
}

export function truncateWithEllipsis(text: string, width: number): string {
  if (width <= 0) {
    return ''
  }
  if (text.length <= width) {
    return text
  }
  if (width <= 3) {
    return '.'.repeat(width)
  }
  return `${text.slice(0, width - 3)}...`
}

export function formatSummaryCellContent(tag: string, value: string, width: number): string {
  const slot = detectSummarySlot(tag)
  const policy = SUMMARY_TRUNCATION_POLICIES[slot]
  const prefix = `[${tag}] `

  if (width <= prefix.length) {
    return truncateWithEllipsis(`[${tag}]`, width)
  }

  const valueWidth = Math.max(policy.minValueChars, width - prefix.length)
  const renderedValue = truncateWithEllipsis(value, Math.min(valueWidth, width - prefix.length))
  return truncateWithEllipsis(`${prefix}${renderedValue}`, width)
}
