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

const STRUCTURED_RISK_COMMANDS = new Set([
  'sudo',
  'rm',
  'dd',
  'mkfs',
  'shutdown',
  'reboot',
  'chmod',
  'chown',
  'curl',
  'wget',
])

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map(token => token.trim())
    .filter(token => token.length > 0)
}

function includesPipeToShell(tokens: string[], input: string): boolean {
  const hasPipe = input.includes('|')
  if (!hasPipe) {
    return false
  }

  const hasDownloader = tokens.includes('curl') || tokens.includes('wget')
  const hasShell = tokens.includes('sh') || tokens.includes('bash') || tokens.includes('zsh')
  return hasDownloader && hasShell
}

function includesDangerousRm(tokens: string[]): boolean {
  for (let idx = 0; idx < tokens.length; idx++) {
    if (tokens[idx] !== 'rm') {
      continue
    }

    const window = tokens.slice(idx + 1, idx + 4)
    for (const token of window) {
      if (!token.startsWith('-')) {
        continue
      }
      const flags = token.slice(1)
      if (flags.includes('r') && flags.includes('f')) {
        return true
      }
    }
  }
  return false
}

function hasChainedRiskyCommand(tokens: string[], input: string): boolean {
  const hasChainOperator = input.includes('&&') || input.includes(';') || input.includes('||')
  if (!hasChainOperator) {
    return false
  }

  return tokens.some(token => STRUCTURED_RISK_COMMANDS.has(token))
}

function isRiskyByStructure(input: string): boolean {
  const tokens = tokenize(input)
  if (tokens.length === 0) {
    return false
  }

  if (tokens.includes('sudo')) {
    return true
  }

  if (includesDangerousRm(tokens)) {
    return true
  }

  if (includesPipeToShell(tokens, input.toLowerCase())) {
    return true
  }

  if (input.includes('>') && input.toLowerCase().includes('/dev/')) {
    return true
  }

  if (hasChainedRiskyCommand(tokens, input)) {
    return true
  }

  return false
}

function isRiskyByRegex(input: string): boolean {
  const riskyPatterns = [
    /(^|\s)sudo(\s|$)/i,
    /\brm\b\s+[^\n]*-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)\b/i,
    /(curl|wget)\s+[^|]*\|\s*(sh|bash|zsh)\b/i,
    />\s*\/dev\//i,
    // URL fetch commands always require explicit approval (SSRF / data exfiltration)
    /^(open|fetch)\s+https?:\/\//i,
  ]

  return riskyPatterns.some(pattern => pattern.test(input))
}

function isRiskyInput(input: string): boolean {
  return isRiskyByStructure(input) || isRiskyByRegex(input)
}

export function getPermissionKey(input: string): string {
  const tokens = tokenize(input)
  if (tokens.length === 0) {
    return 'perm:unknown'
  }

  const firstToken = tokens[0]

  // sudo: capture "sudo <next-command>"
  if (firstToken === 'sudo') {
    const second = tokens[1] ?? 'cmd'
    return `perm:sudo:${second}`
  }

  // rm with recursive+force flags
  if (firstToken === 'rm' && includesDangerousRm(tokens)) {
    return 'perm:rm-rf'
  }

  // pipe-to-shell (curl/wget | sh/bash/zsh)
  if (includesPipeToShell(tokens, input.toLowerCase())) {
    const downloader = tokens.includes('curl') ? 'curl' : 'wget'
    return `perm:pipe-to-shell:${downloader}`
  }

  // redirect to /dev/
  if (input.includes('>') && input.toLowerCase().includes('/dev/')) {
    return 'perm:redirect-dev'
  }

  // chained risky command: capture the first risky token found
  if (hasChainedRiskyCommand(tokens, input)) {
    const riskyToken = tokens.find(t => STRUCTURED_RISK_COMMANDS.has(t)) ?? firstToken
    return `perm:chain:${riskyToken}`
  }

  // URL fetch: use the domain as scope key
  const urlMatch = /^(?:open|fetch)\s+(https?:\/\/[^\s/]+)/i.exec(input)
  if (urlMatch) {
    const domain = urlMatch[1]
    return `perm:url:${domain}`
  }

  // regex-only risk: use first command word
  return `perm:${firstToken}`
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
