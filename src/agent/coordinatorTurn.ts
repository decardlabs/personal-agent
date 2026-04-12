/**
 * Coordinator Turn — Research → Synthesis → Response pipeline.
 *
 * Inspired by Claude-Code's Coordinator mode (src/coordinator/).
 * When enabled via the `coordinator_mode` feature flag, complex inputs that
 * would normally fall through to the LLM are instead processed in three
 * explicit phases:
 *
 *   1. Research   — parallel read-only tool workers gather context
 *   2. Synthesis  — the LLM integrates research findings into a coherent plan
 *   3. Response   — the synthesized answer is returned to the caller
 *
 * For this personal-agent implementation the "worker" model is lightweight:
 * each research task is an in-process tool call (search or read-file) rather
 * than a forked sub-agent, preserving the single-process architecture while
 * capturing the coordination pattern.
 */

import type { SessionEventRepository } from '../storage/sessionEventRepository.js'
import type { MemoryCoordinator, LLMContextBundle } from '../memory/memoryCoordinator.js'
import type { ToolPermissionRepository } from '../storage/toolPermissionRepository.js'
import type { TurnOptions, TurnResult } from './runTurn.js'
import { runReadFileTool } from '../tools/readFileTool.js'
import { runSearchTool } from '../tools/searchTool.js'
import { runListDirTool } from '../tools/listDirTool.js'

export type ResearchTask = {
  kind: 'search' | 'read-file' | 'list-dir'
  arg: string
}

export type ResearchFinding = {
  task: ResearchTask
  output: string
}

export type CoordinatorPhase = 'research' | 'synthesis' | 'response'

export type CoordinatorTurnResult = TurnResult & {
  phase: CoordinatorPhase
  findings: ResearchFinding[]
  synthesisInput: string
}

/**
 * Extracts zero or more research tasks from a natural-language input.
 * Heuristic: look for path-like tokens and keyword signals that suggest
 * files or directories should be read first before the LLM responds.
 * Returns an empty array when no research is needed (falls back to direct LLM).
 */
export function extractResearchTasks(input: string): ResearchTask[] {
  const tasks: ResearchTask[] = []
  const lower = input.toLowerCase()

  // Common research triggers: "explain X", "what is X", "summarize X", "analyze X"
  // We extract path-like tokens and file-extension tokens as research targets.
  const tokens = input.split(/\s+/)
  for (const token of tokens) {
    const clean = token.replace(/[.,;:!?'"(){}[\]]$/, '')
    const isFilePath = (
      clean.includes('/') ||
      /\.[a-z]{1,5}$/i.test(clean) ||
      clean.startsWith('src/') ||
      clean.startsWith('./') ||
      clean.startsWith('../')
    )

    if (isFilePath && clean.length > 2) {
      // If it looks like a directory (no extension and ends in or is a short name)
      if (!clean.includes('.') || clean.endsWith('/')) {
        tasks.push({ kind: 'list-dir', arg: clean.replace(/\/$/, '') })
      } else {
        tasks.push({ kind: 'read-file', arg: clean })
      }
    }
  }

  // If input explicitly asks to search, also add a search task
  if (lower.includes('search') || lower.includes('find') || lower.includes('look for')) {
    const after = input.slice(lower.indexOf('for') !== -1 ? lower.indexOf('for') + 3 : 0).trim()
    const searchQuery = after.split(/\s+/).slice(0, 5).join(' ')
    if (searchQuery.length > 0) {
      tasks.push({ kind: 'search', arg: searchQuery })
    }
  }

  // Deduplicate by kind+arg
  const seen = new Set<string>()
  return tasks.filter(t => {
    const key = `${t.kind}:${t.arg}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Runs a single research task and returns its finding.
 * Uses injectable tool runners from TurnOptions for testability.
 */
async function runResearchTask(
  task: ResearchTask,
  options: TurnOptions,
): Promise<ResearchFinding> {
  let output: string

  switch (task.kind) {
    case 'read-file': {
      const runner = options.readFileToolRunner ?? runReadFileTool
      output = runner({ filePath: task.arg }).output
      break
    }
    case 'list-dir': {
      const runner = options.listDirToolRunner ?? runListDirTool
      output = runner({ dirPath: task.arg }).output
      break
    }
    case 'search': {
      const runner = options.searchToolRunner ?? runSearchTool
      output = runner({ query: task.arg }).output
      break
    }
  }

  return { task, output }
}

/**
 * Builds the synthesis prompt that the LLM receives after research.
 * The prompt injects all research findings and asks the LLM to integrate them.
 */
function buildSynthesisPrompt(
  originalInput: string,
  findings: ResearchFinding[],
  contextBundle: LLMContextBundle,
): string {
  const findingBlocks = findings
    .map((f, i) => `[Research ${i + 1}] ${f.task.kind}:${f.task.arg}\n${f.output}`)
    .join('\n\n---\n\n')

  const historyLines = contextBundle.history
    .map(h => `User: ${h.input}\nAssistant: ${h.response}`)
    .join('\n')

  const factLines = contextBundle.persistentFacts
    .map(f => `- ${f.key}: ${f.value}`)
    .join('\n')

  const parts: string[] = []

  if (contextBundle.preferences.length > 0) {
    parts.push(`User preferences:\n${contextBundle.preferences.map(p => `- ${p.key}: ${p.value}`).join('\n')}`)
  }
  if (factLines) {
    parts.push(`Remembered facts:\n${factLines}`)
  }
  if (historyLines) {
    parts.push(`Recent conversation:\n${historyLines}`)
  }
  if (findings.length > 0) {
    parts.push(`Research findings:\n${findingBlocks}`)
  }
  parts.push(`User question: ${originalInput}`)

  return parts.join('\n\n')
}

/**
 * Executes a coordinator turn:
 *  1. Extract research tasks from the input
 *  2. Run all research tasks (parallel in process)
 *  3. Synthesize findings via LLM
 *  4. Return the synthesized response
 *
 * Falls back to a direct LLM call when no research tasks are found.
 */
export async function runCoordinatorTurn(
  input: string,
  sessionId: string,
  turnId: string,
  rememberedLastEcho: string | null,
  contextBundle: LLMContextBundle,
  repository: SessionEventRepository,
  memory: MemoryCoordinator,
  _permissionRepository: ToolPermissionRepository,
  options: TurnOptions,
): Promise<CoordinatorTurnResult> {
  const tasks = extractResearchTasks(input)

  // Phase: Research (parallel)
  const findings: ResearchFinding[] = tasks.length > 0
    ? await Promise.all(tasks.map(task => runResearchTask(task, options)))
    : []

  // Phase: Synthesis — build enriched prompt
  const synthesisInput = buildSynthesisPrompt(input, findings, contextBundle)

  let response = 'No LLM configured for coordinator synthesis.'

  if (options.llmResponder) {
    try {
      const llmResponse = await options.llmResponder({
        input: synthesisInput,
        sessionId,
        turnId,
        rememberedLastEcho,
        contextBundle,
      })
      response = llmResponse.trim() || response
    } catch {
      response = 'Coordinator synthesis failed. Please try again.'
    }
  } else if (findings.length > 0) {
    // No LLM but we have research: surface raw findings
    response = findings
      .map(f => `[${f.task.kind}: ${f.task.arg}]\n${f.output}`)
      .join('\n\n')
  }

  memory.session.set(sessionId, 'last_response', response)

  return {
    sessionId,
    turnId,
    response,
    phase: findings.length > 0 ? 'synthesis' : 'response',
    findings,
    synthesisInput,
  }
}
