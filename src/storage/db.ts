import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const DEFAULT_DB_PATH = resolve(process.cwd(), 'data', 'assistant.db')

export function getDatabasePath(): string {
  return process.env.PA_DB_PATH ?? DEFAULT_DB_PATH
}

export function initializeDatabase(path = getDatabasePath()): Database.Database {
  const dir = dirname(path)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }

  return new Database(path)
}
