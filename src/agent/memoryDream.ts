import type { SessionEventRepository } from '../storage/sessionEventRepository.js'
import type { MemoryCoordinator } from '../memory/memoryCoordinator.js'
import type { TurnOptions } from './runTurn.js'

export type MemoryDreamConfig = {
  enabled: boolean
  minSessionCount: number
  minHoursSinceLastDream: number
  maxSourceTurns: number
  minFactConfidence: number
  maxFactsToWrite: number
  lockTtlMs: number
}

export type MemoryDreamResult = {
  triggered: boolean
  reason: string
  wroteFactCount: number
  rejectedFactCount: number
  removedCount: number
  sourceTurnCount: number
}

type DreamFact = {
  key: string
  value: string
  confidence: number
}

type RecentTurn = {
  sessionId: string
  input: string
  response: string
  createdAt: string
}

function parseDreamFacts(raw: string): DreamFact[] {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  const jsonText = fenced?.[1] ?? trimmed

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    return []
  }

  const items = Array.isArray(parsed)
    ? parsed
    : (parsed && typeof parsed === 'object' && Array.isArray((parsed as { facts?: unknown }).facts))
      ? (parsed as { facts: unknown[] }).facts
      : []

  return items
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map(item => ({
      key: typeof item.key === 'string' ? item.key.trim() : '',
      value: typeof item.value === 'string' ? item.value.trim() : '',
      confidence: typeof item.confidence === 'number' ? item.confidence : Number(item.confidence ?? 0),
    }))
    .filter(item => item.key.length > 0 && item.value.length > 0 && Number.isFinite(item.confidence))
}

function buildDreamPrompt(
  turns: RecentTurn[],
  persistentFacts: Array<{ key: string; value: string; confidence: number }>,
): string {
  const turnLines = turns.map((turn, index) => {
    const lines = [
      `[Turn ${index + 1}] session=${turn.sessionId} at=${turn.createdAt}`,
      `User: ${turn.input}`,
      `Assistant: ${turn.response}`,
    ]
    return lines.join('\n')
  })

  const factLines = persistentFacts.map(fact =>
    `- ${fact.key}: ${fact.value} (confidence=${fact.confidence.toFixed(2)})`,
  )

  return [
    'You are consolidating assistant memory.',
    'Return JSON only.',
    'Schema: [{"key":"string","value":"string","confidence":0.0}]',
    'Only include durable user facts, long-lived preferences, or stable project facts.',
    'Do not include ephemeral turn details, timestamps, or duplicate restatements.',
    'Keep confidence between 0 and 1.',
    '',
    'Existing persistent facts:',
    factLines.length > 0 ? factLines.join('\n') : '(none)',
    '',
    'Recent turns to consolidate:',
    turnLines.join('\n\n'),
  ].join('\n')
}

function buildRecentTurns(
  repository: SessionEventRepository,
  sessionId: string,
  input: string,
  response: string,
  maxSourceTurns: number,
): RecentTurn[] {
  const turns: RecentTurn[] = [{
    sessionId,
    input,
    response,
    createdAt: new Date().toISOString(),
  }]

  const priorTurns = repository.listRecentTurnCompleted(Math.max(0, maxSourceTurns - 1))
    .map(event => {
      const payload = event.payload
      return {
        sessionId: event.sessionId,
        input: typeof payload.input === 'string' ? payload.input : '',
        response: typeof payload.response === 'string' ? payload.response : '',
        createdAt: event.createdAt,
      }
    })
    .filter(turn => turn.input.length > 0 || turn.response.length > 0)

  return [...turns, ...priorTurns].slice(0, maxSourceTurns)
}

export async function maybeRunMemoryDream(args: {
  sessionId: string
  input: string
  response: string
  repository: SessionEventRepository
  memory: MemoryCoordinator
  options: Pick<TurnOptions, 'llmResponder'>
  config: MemoryDreamConfig
}): Promise<MemoryDreamResult> {
  const {
    sessionId,
    input,
    response,
    repository,
    memory,
    options,
    config,
  } = args

  const finalize = (result: MemoryDreamResult): MemoryDreamResult => {
    memory.persistent.set('__last_memory_dream_status', result.triggered ? 'completed' : 'skipped', 1)
    memory.persistent.set('__last_memory_dream_reason', result.reason, 1)
    if (!result.triggered) {
      memory.persistent.set('__last_memory_dream_wrote_count', '0', 1)
    }
    return result
  }

  if (!config.enabled) {
    return finalize({
      triggered: false,
      reason: 'disabled',
      wroteFactCount: 0,
      rejectedFactCount: 0,
      removedCount: 0,
      sourceTurnCount: 0,
    })
  }

  if (!options.llmResponder) {
    return finalize({
      triggered: false,
      reason: 'llm_unavailable',
      wroteFactCount: 0,
      rejectedFactCount: 0,
      removedCount: 0,
      sourceTurnCount: 0,
    })
  }

  const sessionCount = repository.countDistinctSessions()
  if (sessionCount < config.minSessionCount) {
    return finalize({
      triggered: false,
      reason: `insufficient_sessions:${sessionCount}<${config.minSessionCount}`,
      wroteFactCount: 0,
      rejectedFactCount: 0,
      removedCount: 0,
      sourceTurnCount: 0,
    })
  }

  const activeLock = memory.persistent.get('__memory_dream_lock_until')
  if (activeLock) {
    const lockUntil = Date.parse(activeLock)
    if (Number.isFinite(lockUntil) && lockUntil > Date.now()) {
      return finalize({
        triggered: false,
        reason: 'locked',
        wroteFactCount: 0,
        rejectedFactCount: 0,
        removedCount: 0,
        sourceTurnCount: 0,
      })
    }
  }

  const lastDreamAt = memory.persistent.get('__last_memory_dream_at')
  if (lastDreamAt) {
    const elapsedMs = Date.now() - Date.parse(lastDreamAt)
    const minElapsedMs = config.minHoursSinceLastDream * 60 * 60 * 1000
    if (Number.isFinite(elapsedMs) && elapsedMs < minElapsedMs) {
      return finalize({
        triggered: false,
        reason: `too_soon:${elapsedMs}<${minElapsedMs}`,
        wroteFactCount: 0,
        rejectedFactCount: 0,
        removedCount: 0,
        sourceTurnCount: 0,
      })
    }
  }

  const lockUntil = new Date(Date.now() + config.lockTtlMs).toISOString()
  memory.persistent.set('__memory_dream_lock_until', lockUntil, 1)

  try {
    const recentTurns = buildRecentTurns(repository, sessionId, input, response, config.maxSourceTurns)
    const prompt = buildDreamPrompt(
      recentTurns,
      memory.persistent.listRankedFacts(config.maxFactsToWrite, 0),
    )
    const llmResult = await options.llmResponder({
      input: prompt,
      sessionId,
      turnId: 'memory-dream',
      rememberedLastEcho: memory.persistent.get('last_echo_output'),
      contextBundle: memory.buildLLMContextBundle(sessionId, {
        historyLimit: config.maxSourceTurns,
        factLimit: config.maxFactsToWrite,
        minFactConfidence: 0,
      }),
    })

    const candidateFacts = parseDreamFacts(llmResult).slice(0, config.maxFactsToWrite)
    let wroteFactCount = 0
    let rejectedFactCount = 0

    for (const fact of candidateFacts) {
      if (fact.confidence < config.minFactConfidence) {
        rejectedFactCount += 1
        continue
      }

      const decision = memory.evaluatePersistentWrite(fact.key, fact.value, fact.confidence)
      if (!decision.allowed) {
        rejectedFactCount += 1
        continue
      }

      memory.persistent.set(fact.key, fact.value, fact.confidence)
      wroteFactCount += 1
    }

    const consolidation = memory.persistent.consolidate()
    memory.persistent.set('__last_memory_dream_at', new Date().toISOString(), 1)
    memory.persistent.set('__last_memory_dream_wrote_count', String(wroteFactCount), 1)
    memory.persistent.set('__memory_dream_lock_until', new Date(0).toISOString(), 1)

    return finalize({
      triggered: true,
      reason: candidateFacts.length > 0 ? 'triggered' : 'triggered_no_facts',
      wroteFactCount,
      rejectedFactCount,
      removedCount: consolidation.removedCount,
      sourceTurnCount: recentTurns.length,
    })
  } catch {
    memory.persistent.set('__memory_dream_lock_until', new Date(0).toISOString(), 1)
    return finalize({
      triggered: false,
      reason: 'llm_failed',
      wroteFactCount: 0,
      rejectedFactCount: 0,
      removedCount: 0,
      sourceTurnCount: 0,
    })
  }
}
