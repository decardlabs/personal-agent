import { randomUUID } from 'node:crypto'
import type { SessionEventRepository } from '../storage/sessionEventRepository.js'
import { runEchoTool } from '../tools/echoTool.js'
import { transitionTo } from './stateMachine.js'
import type { TurnEvent } from './types.js'
import { detectEchoCommand, normalizeInput } from './inputNormalizer.js'
import type { MemoryCoordinator } from '../memory/memoryCoordinator.js'
import { evaluatePermission } from '../policies/permissionPolicy.js'
import { ToolPermissionRepository } from '../storage/toolPermissionRepository.js'

export type TurnResult = {
  sessionId: string
  turnId: string
  response: string
}

export type TurnOptions = {
  approveRisky?: boolean
  permissionScope?: string
  turnTimeoutMs?: number
  maxToolRetries?: number
  echoToolRunner?: (args: { content: string }) => { output: string }
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
  permissionRepository: ToolPermissionRepository,
  sessionId = randomUUID(),
  options: TurnOptions = {},
): TurnResult {
  const turnId = randomUUID()
  const turnStartedAt = Date.now()
  const permissionScope = options.permissionScope ?? 'project'

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

  const permissionDecision = evaluatePermission(
    {
      normalizedInput,
      toolName: 'echo',
      scope: permissionScope,
      approveRisky: options.approveRisky ?? false,
    },
    permissionRepository,
  )

  if (!permissionDecision.allowed) {
    transitionTo('awaiting_permission')
    repository.save(
      createEvent(sessionId, turnId, 'permission_required', {
        toolName: 'echo',
        permissionKey: permissionDecision.permissionKey,
        reason: permissionDecision.reason,
      }),
    )
    response = 'Permission required for risky input. Re-run with explicit approval.'
  }

  if (permissionDecision.allowed && permissionDecision.permissionKey) {
    repository.save(
      createEvent(sessionId, turnId, 'permission_granted', {
        toolName: 'echo',
        permissionKey: permissionDecision.permissionKey,
        reason: permissionDecision.reason,
      }),
    )
  }

  if (normalizedInput.toLowerCase() === 'recall last echo') {
    response = rememberedLastEcho
      ? `Last echo was: ${rememberedLastEcho}`
      : 'No echo memory yet.'
  }

  if (echoPayload && permissionDecision.allowed) {
    const elapsedMs = Date.now() - turnStartedAt
    if (options.turnTimeoutMs !== undefined && elapsedMs >= options.turnTimeoutMs) {
      transitionTo('done')
      repository.save(
        createEvent(sessionId, turnId, 'tool_timeout', { toolName: 'echo', elapsedMs }),
      )
      repository.save(
        createEvent(sessionId, turnId, 'turn_cancelled', { reason: 'timeout' }),
      )
      return { sessionId, turnId, response: 'Turn cancelled: tool execution timed out.' }
    }

    transitionTo('executing_tool')
    repository.save(
      createEvent(sessionId, turnId, 'tool_called', {
        toolName: 'echo',
        content: echoPayload,
      }),
    )

    const echoRunner = options.echoToolRunner ?? runEchoTool
    const maxRetries = options.maxToolRetries ?? 0
    let attempt = 0
    let toolResult!: { output: string }
    try {
      while (true) {
        try {
          toolResult = echoRunner({ content: echoPayload })
          break
        } catch (err) {
          if (attempt < maxRetries) {
            attempt++
            repository.save(
              createEvent(sessionId, turnId, 'tool_retry', {
                toolName: 'echo',
                attempt,
                error: String(err),
              }),
            )
          } else {
            throw err
          }
        }
      }
    } catch (err) {
      transitionTo('done')
      repository.save(
        createEvent(sessionId, turnId, 'tool_error', {
          toolName: 'echo',
          error: String(err),
        }),
      )
      repository.save(
        createEvent(sessionId, turnId, 'turn_completed', { response: 'Tool execution failed. Please try again.' }),
      )
      return { sessionId, turnId, response: 'Tool execution failed. Please try again.' }
    }

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
