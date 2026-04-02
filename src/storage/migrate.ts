import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createLogger } from '../observability/logger.js'
import { initializeDatabase } from './db.js'

const logger = createLogger()

function runMigrations(): void {
  const db = initializeDatabase()
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at TEXT NOT NULL
    )
  `)

  const migrationDir = resolve(process.cwd(), 'src', 'storage', 'migrations')
  const files = readdirSync(migrationDir)
    .filter(file => file.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b))

  const hasMigrationStmt = db.prepare(
    'SELECT 1 FROM schema_migrations WHERE name = ? LIMIT 1',
  )
  const insertMigrationStmt = db.prepare(
    'INSERT INTO schema_migrations (name, executed_at) VALUES (?, ?)',
  )

  for (const file of files) {
    const executed = hasMigrationStmt.get(file)
    if (executed) {
      continue
    }

    const sql = readFileSync(join(migrationDir, file), 'utf8')
    const trx = db.transaction(() => {
      db.exec(sql)
      insertMigrationStmt.run(file, new Date().toISOString())
    })

    trx()
    logger.info({ migration: file }, 'migration executed')
  }

  logger.info({ count: files.length }, 'migration process complete')
}

runMigrations()
