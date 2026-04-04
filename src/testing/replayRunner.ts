import { initializeDatabase } from '../storage/db.js'
import { applyMigrations } from '../storage/migrate.js'
import { SessionEventRepository } from '../storage/sessionEventRepository.js'
import { MemoryFactRepository } from '../storage/memoryFactRepository.js'
import { PreferenceRepository } from '../storage/preferenceRepository.js'
import { PersistentMemoryStore } from '../memory/persistentMemory.js'
import { createMemoryCoordinator } from '../memory/memoryCoordinator.js'
import { PreferenceStore } from '../memory/preferenceMemory.js'
import { ToolPermissionRepository } from '../storage/toolPermissionRepository.js'
import { runTurn } from '../agent/runTurn.js'
import type { TurnEvent, TurnEventType } from '../agent/types.js'
import type { ReplayCase } from './replayCases.js'

export type ReplayStepResult = {
  input: string
  memoryIntent: 'required' | 'not_required' | 'neutral'
  response: string
  events: TurnEvent[]
}

export type ReplayCaseResult = {
  caseName: string
  stepResults: ReplayStepResult[]
}

export type ReplayFailureReason =
  | 'assertion_mismatch'
  | 'timeout'
  | 'unexpected_error'
  | 'unknown'

export type ReplayCaseSummary = {
  caseName: string
  passed: boolean
  elapsedMs: number
  failureReason: ReplayFailureReason | null
  failureMessage: string | null
}

export type ReplaySuiteSummary = {
  totalCases: number
  passedCases: number
  failedCases: number
  passRate: number
  totalTurns: number
  memoryOpportunityTurns: number
  memoryHitTurns: number
  memoryHitRate: number
  wrongMemoryHitTurns: number
  wrongMemoryHitRate: number
  emptyMemoryHitTurns: number
  emptyMemoryHitRate: number
  totalElapsedMs: number
  averageElapsedMs: number
  cases: ReplayCaseSummary[]
  failureBreakdown: Record<ReplayFailureReason, number>
}

function formatRate(value: number): string {
  return `${value.toFixed(2)}%`
}

function formatMs(value: number): string {
  return `${value.toFixed(2)}ms`
}

function classifyFailureReason(error: unknown): ReplayFailureReason {
  const message = String(error).toLowerCase()
  if (message.includes('timed out') || message.includes('timeout')) {
    return 'timeout'
  }
  if (message.includes('expected') || message.includes('mismatch')) {
    return 'assertion_mismatch'
  }
  if (error instanceof Error) {
    return 'unexpected_error'
  }
  return 'unknown'
}

function isMemoryHit(step: ReplayStepResult): boolean {
  if (step.response.startsWith('Last echo was:')) {
    return true
  }

  const reasoningEvent = step.events.find(event => event.eventType === 'reasoning_started')
  const remembered = reasoningEvent?.payload?.rememberedLastEcho
  return typeof remembered === 'string' && remembered.length > 0
}

function isMemoryOpportunity(step: ReplayStepResult): boolean {
  return step.memoryIntent === 'required'
}

function isEmptyMemoryHit(step: ReplayStepResult): boolean {
  return step.memoryIntent === 'required'
    && step.response === 'No echo memory yet.'
}

function isWrongMemoryHit(step: ReplayStepResult): boolean {
  return step.memoryIntent === 'not_required' && isMemoryHit(step)
}

function compareCaseExpectations(
  testCase: ReplayCase,
  result: ReplayCaseResult,
): string | null {
  const actualResponses = result.stepResults.map(step => step.response)
  if (JSON.stringify(actualResponses) !== JSON.stringify(testCase.expectedResponses)) {
    return 'response mismatch'
  }

  if (!testCase.expectedEventTypes) {
    return null
  }

  const actualEvents = result.stepResults.map(step => extractEventTypes(step.events))
  if (JSON.stringify(actualEvents) !== JSON.stringify(testCase.expectedEventTypes)) {
    return 'event type mismatch'
  }

  return null
}

export async function runReplaySuite(
  cases: ReplayCase[],
): Promise<ReplaySuiteSummary> {
  const caseSummaries: ReplayCaseSummary[] = []
  let totalTurns = 0
  let memoryOpportunityTurns = 0
  let memoryHitTurns = 0
  let wrongMemoryHitTurns = 0
  let emptyMemoryHitTurns = 0

  for (const testCase of cases) {
    const started = Date.now()
    try {
      const result = await runReplayCase(testCase)
      totalTurns += result.stepResults.length
      memoryOpportunityTurns += result.stepResults.filter(isMemoryOpportunity).length
      memoryHitTurns += result.stepResults.filter(isMemoryHit).length
      wrongMemoryHitTurns += result.stepResults.filter(isWrongMemoryHit).length
      emptyMemoryHitTurns += result.stepResults.filter(isEmptyMemoryHit).length

      const mismatch = compareCaseExpectations(testCase, result)
      if (mismatch) {
        caseSummaries.push({
          caseName: testCase.name,
          passed: false,
          elapsedMs: Date.now() - started,
          failureReason: 'assertion_mismatch',
          failureMessage: mismatch,
        })
        continue
      }

      caseSummaries.push({
        caseName: testCase.name,
        passed: true,
        elapsedMs: Date.now() - started,
        failureReason: null,
        failureMessage: null,
      })
    } catch (error) {
      caseSummaries.push({
        caseName: testCase.name,
        passed: false,
        elapsedMs: Date.now() - started,
        failureReason: classifyFailureReason(error),
        failureMessage: String(error),
      })
    }
  }

  const totalCases = caseSummaries.length
  const passedCases = caseSummaries.filter(entry => entry.passed).length
  const failedCases = totalCases - passedCases
  const totalElapsedMs = caseSummaries.reduce((sum, entry) => sum + entry.elapsedMs, 0)
  const averageElapsedMs = totalCases > 0 ? totalElapsedMs / totalCases : 0
  const passRate = totalCases > 0 ? (passedCases / totalCases) * 100 : 0
  const memoryHitRate = totalTurns > 0 ? (memoryHitTurns / totalTurns) * 100 : 0
  const wrongMemoryHitRate = totalTurns > 0 ? (wrongMemoryHitTurns / totalTurns) * 100 : 0
  const emptyMemoryHitRate = memoryOpportunityTurns > 0
    ? (emptyMemoryHitTurns / memoryOpportunityTurns) * 100
    : 0

  const failureBreakdown: Record<ReplayFailureReason, number> = {
    assertion_mismatch: 0,
    timeout: 0,
    unexpected_error: 0,
    unknown: 0,
  }

  for (const entry of caseSummaries) {
    if (!entry.failureReason) {
      continue
    }
    failureBreakdown[entry.failureReason] += 1
  }

  return {
    totalCases,
    passedCases,
    failedCases,
    passRate,
    totalTurns,
    memoryOpportunityTurns,
    memoryHitTurns,
    memoryHitRate,
    wrongMemoryHitTurns,
    wrongMemoryHitRate,
    emptyMemoryHitTurns,
    emptyMemoryHitRate,
    totalElapsedMs,
    averageElapsedMs,
    cases: caseSummaries,
    failureBreakdown,
  }
}

export function formatReplaySuiteSummary(summary: ReplaySuiteSummary): string {
  const header = [
    'Replay Summary',
    `- Total cases: ${summary.totalCases}`,
    `- Passed: ${summary.passedCases}`,
    `- Failed: ${summary.failedCases}`,
    `- Pass rate: ${formatRate(summary.passRate)}`,
    `- Total turns: ${summary.totalTurns}`,
    `- Memory-opportunity turns: ${summary.memoryOpportunityTurns}`,
    `- Memory-hit turns: ${summary.memoryHitTurns}`,
    `- Memory-hit rate: ${formatRate(summary.memoryHitRate)}`,
    `- Wrong-memory-hit turns: ${summary.wrongMemoryHitTurns}`,
    `- Wrong-memory-hit rate: ${formatRate(summary.wrongMemoryHitRate)}`,
    `- Empty-memory-hit turns: ${summary.emptyMemoryHitTurns}`,
    `- Empty-memory-hit rate: ${formatRate(summary.emptyMemoryHitRate)}`,
    `- Total elapsed: ${formatMs(summary.totalElapsedMs)}`,
    `- Average elapsed: ${formatMs(summary.averageElapsedMs)}`,
    '- Failure breakdown:',
    `  - assertion_mismatch: ${summary.failureBreakdown.assertion_mismatch}`,
    `  - timeout: ${summary.failureBreakdown.timeout}`,
    `  - unexpected_error: ${summary.failureBreakdown.unexpected_error}`,
    `  - unknown: ${summary.failureBreakdown.unknown}`,
  ]

  const caseLines = summary.cases.map(entry => {
    const status = entry.passed ? 'PASS' : 'FAIL'
    const failure = entry.failureReason
      ? ` | reason=${entry.failureReason}${entry.failureMessage ? ` | detail=${entry.failureMessage}` : ''}`
      : ''
    return `- [${status}] ${entry.caseName} (${formatMs(entry.elapsedMs)})${failure}`
  })

  return [...header, '- Case details:', ...caseLines].join('\n')
}

export async function runReplayCase(testCase: ReplayCase): Promise<ReplayCaseResult> {
  const db = initializeDatabase(':memory:')
  applyMigrations(db)

  const eventRepository = new SessionEventRepository(db)
  const memoryRepository = new MemoryFactRepository(db)
  const preferenceRepository = new PreferenceRepository(db)
  const permissionRepository = new ToolPermissionRepository(db)
  const memory = createMemoryCoordinator(
    new PersistentMemoryStore(memoryRepository),
    new PreferenceStore(preferenceRepository),
  )

  for (const seed of testCase.seedPersistentFacts ?? []) {
    memory.persistent.set(seed.key, seed.value, seed.confidence)
  }

  const stepResults: ReplayStepResult[] = []

  for (const step of testCase.steps) {
    const searchToolRunner = step.mockSearchOutput
      ? () => ({ output: step.mockSearchOutput as string })
      : undefined

    const readFileToolRunner = step.mockReadFileOutput
      ? () => ({ output: step.mockReadFileOutput as string })
      : undefined

    const llmResponder = step.mockLlmResponderMode
      ? async (args: {
        contextBundle: {
          persistentFacts: Array<{ key: string }>
        }
      }): Promise<string> => {
        if (step.mockLlmResponderMode === 'facts_summary') {
          const keys = args.contextBundle.persistentFacts.map(fact => fact.key)
          return `LLM facts: ${keys.length > 0 ? keys.join(',') : '(none)'}`
        }

        return 'LLM mock responder unavailable.'
      }
      : undefined

    const turn = await runTurn(
      step.input,
      eventRepository,
      memory,
      permissionRepository,
      testCase.sessionId,
      {
        approveRisky: step.approveRisky ?? false,
        turnTimeoutMs: step.turnTimeoutMs,
        searchToolRunner,
        readFileToolRunner,
        llmResponder,
      },
    )

    stepResults.push({
      input: step.input,
      memoryIntent: step.memoryIntent ?? 'neutral',
      response: turn.response,
      events: eventRepository.listByTurn(turn.sessionId, turn.turnId),
    })
  }

  return {
    caseName: testCase.name,
    stepResults,
  }
}

export function extractEventTypes(events: TurnEvent[]): TurnEventType[] {
  return events.map(event => event.eventType)
}
