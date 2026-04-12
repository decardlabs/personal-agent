import type { SessionEventRepository } from '../storage/sessionEventRepository.js'
import type { MemoryCoordinator } from '../memory/memoryCoordinator.js'
import type { AutoConsolidationConfig } from '../memory/memoryCoordinator.js'
import type { TurnOptions } from './runTurn.js'
import { maybeRunMemoryDream } from './memoryDream.js'
import type { TurnEvent } from './types.js'

function createEvent(
  sessionId: string,
  turnId: string,
  eventType: TurnEvent['eventType'],
  payload: Record<string, unknown>,
): TurnEvent {
  return {
    sessionId,
    turnId,
    eventType,
    payload,
    createdAt: new Date().toISOString(),
  }
}

export async function finalizeTurnArtifacts(args: {
  sessionId: string
  turnId: string
  normalizedInput: string
  finalResponse: string
  repository: SessionEventRepository
  memory: MemoryCoordinator
  options: Pick<TurnOptions, 'llmResponder' | 'autoConsolidationConfig' | 'memoryDreamConfig'>
}): Promise<void> {
  const {
    sessionId,
    turnId,
    normalizedInput,
    finalResponse,
    repository,
    memory,
    options,
  } = args

  memory.session.pushHistory(sessionId, { input: normalizedInput, response: finalResponse })

  if (options.autoConsolidationConfig) {
    const consolidation = memory.maybeAutoConsolidate(sessionId, options.autoConsolidationConfig as AutoConsolidationConfig)
    repository.save(
      createEvent(
        sessionId,
        turnId,
        consolidation.triggered ? 'memory_auto_consolidated' : 'memory_auto_consolidation_skipped',
        {
          reason: consolidation.reason,
          removedCount: consolidation.removedCount,
        },
      ),
    )
  }

  if (!options.memoryDreamConfig?.enabled) {
    return
  }

  const dream = await maybeRunMemoryDream({
    sessionId,
    input: normalizedInput,
    response: finalResponse,
    repository,
    memory,
    options,
    config: options.memoryDreamConfig,
  })
  const dreamDiagnostics = memory.getDiagnostics(sessionId)
  repository.save(
    createEvent(
      sessionId,
      turnId,
      dream.triggered ? 'memory_dream_completed' : 'memory_dream_skipped',
      {
        reason: dream.reason,
        reasonCode: dreamDiagnostics.lastMemoryDreamReasonCode,
        guidance: dreamDiagnostics.lastMemoryDreamGuidance,
        wroteFactCount: dream.wroteFactCount,
        rejectedFactCount: dream.rejectedFactCount,
        removedCount: dream.removedCount,
        sourceTurnCount: dream.sourceTurnCount,
      },
    ),
  )
}