import { randomUUID } from 'node:crypto'
import type { SessionEventRepository } from '../storage/sessionEventRepository.js'
import { runEchoTool } from '../tools/echoTool.js'
import { transitionTo } from './stateMachine.js'
import type { TurnEvent } from './types.js'
import { detectEchoCommand, normalizeInput } from './inputNormalizer.js'

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
  sessionId = randomUUID(),
): TurnResult {
  const turnId = randomUUID()

  transitionTo('normalizing_input')
  const normalizedInput = normalizeInput(input)
  repository.save(
    createEvent(sessionId, turnId, 'input_normalized', {
      input,
      normalizedInput,
    }),
  )

  transitionTo('reasoning')
  repository.save(
    createEvent(sessionId, turnId, 'reasoning_started', {
      normalizedInput,
    }),
  )

  const echoPayload = detectEchoCommand(normalizedInput)
  let response = 'I can run echo only in this MVP. Try: echo hello'

  if (echoPayload) {
    transitionTo('executing_tool')
    repository.save(
      createEvent(sessionId, turnId, 'tool_called', {
        toolName: 'echo',
        content: echoPayload,
      }),
    )

    const toolResult = runEchoTool({ content: echoPayload })
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
