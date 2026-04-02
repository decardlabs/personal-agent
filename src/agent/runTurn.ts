import { randomUUID } from 'node:crypto'
import type { SessionEventRepository } from '../storage/sessionEventRepository.js'
import { runEchoTool } from '../tools/echoTool.js'
import { transitionTo } from './stateMachine.js'
import type { TurnEvent } from './types.js'
import { detectEchoCommand, normalizeInput } from './inputNormalizer.js'
import type { MemoryCoordinator } from '../memory/memoryCoordinator.js'

export type TurnResult = {
  sessionId: string
  turnId: string
  response: string
}

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

export function runTurn(
  input: string,
  repository: SessionEventRepository,
  memory: MemoryCoordinator,
  sessionId = randomUUID(),
): TurnResult {
  const turnId = randomUUID()

  transitionTo('normalizing_input')
  const normalizedInput = normalizeInput(input)
  memory.session.set(sessionId, 'last_input', normalizedInput)
  repository.save(
    createEvent(sessionId, turnId, 'input_normalized', {
      input,
      normalizedInput,
    }),
  )

  transitionTo('reasoning')
  const context = memory.getContextSnapshot()
  const rememberedLastEcho = memory.persistent.get('last_echo_output')
  repository.save(
    createEvent(sessionId, turnId, 'reasoning_started', {
      normalizedInput,
      context,
      rememberedLastEcho,
    }),
  )

  const echoPayload = detectEchoCommand(normalizedInput)
  let response = 'I can run echo only in this MVP. Try: echo hello'

  if (normalizedInput.toLowerCase() === 'recall last echo') {
    response = rememberedLastEcho
      ? `Last echo was: ${rememberedLastEcho}`
      : 'No echo memory yet.'
  }

  if (echoPayload) {
    transitionTo('executing_tool')
    repository.save(
      createEvent(sessionId, turnId, 'tool_called', {
        toolName: 'echo',
        content: echoPayload,
      }),
    )

    const toolResult = runEchoTool({ content: echoPayload })
    memory.persistent.set('last_echo_output', toolResult.output, 0.9)
    memory.session.set(sessionId, 'last_response', toolResult.output)
    repository.save(
      createEvent(sessionId, turnId, 'tool_result_received', {
        toolName: 'echo',
        output: toolResult.output,
      }),
    )

    transitionTo('feeding_back_result')
    response = `Echo: ${toolResult.output}`
  }

  transitionTo('done')
  repository.save(
    createEvent(sessionId, turnId, 'turn_completed', {
      response,
    }),
  )

  return {
    sessionId,
    turnId,
    response,
  }
}
