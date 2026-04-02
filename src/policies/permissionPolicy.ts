import { ToolPermissionRepository } from '../storage/toolPermissionRepository.js'

export type PermissionDecision =
  | {
      allowed: true
      permissionKey: string | null
      reason: 'safe' | 'approved' | 'approved_now'
    }
  | {
      allowed: false
      permissionKey: string
      reason: 'approval_required'
    }

export type PermissionRequest = {
  normalizedInput: string
  toolName: string
  scope: string
  approveRisky: boolean
}

function isRiskyInput(input: string): boolean {
  const riskyPatterns = [
    /(^|\s)sudo(\s|$)/i,
    /rm\s+-rf/i,
    /curl\s+[^|]*\|\s*(sh|bash)/i,
    />\s*\/dev\//i,
  ]

  return riskyPatterns.some(pattern => pattern.test(input))
}

export function getPermissionKey(input: string): string {
  return `input:${input}`
}

export function evaluatePermission(
  request: PermissionRequest,
  repository: ToolPermissionRepository,
): PermissionDecision {
  const { normalizedInput, toolName, scope, approveRisky } = request

  if (!isRiskyInput(normalizedInput)) {
    return {
      allowed: true,
      permissionKey: null,
      reason: 'safe',
    }
  }

  const permissionKey = getPermissionKey(normalizedInput)
  if (repository.hasPermission(scope, permissionKey)) {
    return {
      allowed: true,
      permissionKey,
      reason: 'approved',
    }
  }

  if (!approveRisky) {
    return {
      allowed: false,
      permissionKey,
      reason: 'approval_required',
    }
  }

  repository.grant(scope, toolName, permissionKey, new Date().toISOString())
  return {
    allowed: true,
    permissionKey,
    reason: 'approved_now',
  }
}
