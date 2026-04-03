import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const HISTORY_DIR = join(homedir(), '.claude-personal')
const HISTORY_FILE = join(HISTORY_DIR, 'repl-history.json')
const MAX_HISTORY_SIZE = 500

export type HistoryEntry = {
  command: string
  timestamp: string
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
    return Array.isArray(parsed) ? parsed : []
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

export function addToHistory(command: string): void {
  const history = readHistory()
  const trimmed = command.trim()
  if (!trimmed || trimmed.startsWith('/')) {
    // Don't save utility commands or empty lines
    return
  }
  history.push({
    command: trimmed,
    timestamp: new Date().toISOString(),
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

export function clearHistory(): void {
  ensureHistoryDir()
  try {
    writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2), 'utf-8')
  } catch {
    // Silently fail
  }
}

export function formatHistory(): string {
  const history = readHistory()
  if (history.length === 0) {
    return '(no command history yet)'
  }
  return history
    .slice(-50) // Show last 50
    .map((entry, idx) => `  ${String(idx + 1).padStart(3)}: ${entry.command}`)
    .join('\n')
}
