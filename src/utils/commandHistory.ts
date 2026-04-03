import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const HISTORY_DIR = join(homedir(), '.claude-personal')
const HISTORY_FILE = join(HISTORY_DIR, 'repl-history.json')
const MAX_HISTORY_SIZE = 500

export type HistoryEntry = {
  command: string
  timestamp: string
  sessionId?: string
  projectCwd?: string
}

function ensureHistoryDir(): void {
  if (!existsSync(HISTORY_DIR)) {
    mkdirSync(HISTORY_DIR, { recursive: true })
  }
}

function readHistory(): HistoryEntry[] {
  ensureHistoryDir()
  if (!existsSync(HISTORY_FILE)) {
    return []
  }
  try {
    const content = readFileSync(HISTORY_FILE, 'utf-8')
    const parsed = JSON.parse(content) as HistoryEntry[]
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter(entry => entry && typeof entry.command === 'string' && typeof entry.timestamp === 'string')
      .map(entry => ({
        command: entry.command,
        timestamp: entry.timestamp,
        sessionId: typeof entry.sessionId === 'string' ? entry.sessionId : undefined,
        projectCwd: typeof entry.projectCwd === 'string' ? entry.projectCwd : undefined,
      }))
  } catch {
    return []
  }
}

function writeHistory(entries: HistoryEntry[]): void {
  ensureHistoryDir()
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify(entries, null, 2), 'utf-8')
  } catch {
    // Silently fail if can't write
  }
}

export function addToHistory(command: string, options?: { sessionId?: string; projectCwd?: string }): void {
  const history = readHistory()
  const trimmed = command.trim()
  if (!trimmed || trimmed.startsWith('/')) {
    // Don't save utility commands or empty lines
    return
  }
  history.push({
    command: trimmed,
    timestamp: new Date().toISOString(),
    sessionId: options?.sessionId,
    projectCwd: options?.projectCwd,
  })
  // Keep only last MAX_HISTORY_SIZE entries
  if (history.length > MAX_HISTORY_SIZE) {
    history.splice(0, history.length - MAX_HISTORY_SIZE)
  }
  writeHistory(history)
}

export function getHistory(): HistoryEntry[] {
  return readHistory()
}

export function getProjectHistory(sessionId: string, projectCwd: string, limit = 50): HistoryEntry[] {
  const entries = readHistory()
    .filter(entry => !entry.projectCwd || entry.projectCwd === projectCwd)
    .reverse()

  const currentSession: HistoryEntry[] = []
  const otherSessions: HistoryEntry[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    if (seen.has(entry.command)) {
      continue
    }
    seen.add(entry.command)

    if (entry.sessionId === sessionId) {
      currentSession.push(entry)
    } else {
      otherSessions.push(entry)
    }
  }

  return [...currentSession, ...otherSessions].slice(0, limit)
}

export function clearHistory(): void {
  ensureHistoryDir()
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), 'utf-8')
  } catch {
    // Silently fail
  }
}

export function formatHistory(sessionId: string, projectCwd: string): string {
  const history = getProjectHistory(sessionId, projectCwd, 50)
  if (history.length === 0) {
    return '(no command history yet)'
  }
  return history
    .map((entry, idx) => `  ${String(idx + 1).padStart(3)}: ${entry.command}`)
    .join('\n')
}

export function formatHistoryAll(projectCwd: string): string {
  const history = readHistory()
    .filter(entry => !entry.projectCwd || entry.projectCwd === projectCwd)
    .slice(-50)

  if (history.length === 0) {
    return '(no command history yet)'
  }

  return history
    .map((entry, idx) => `  ${String(idx + 1).padStart(3)}: ${entry.command}`)
    .join('\n')
}
