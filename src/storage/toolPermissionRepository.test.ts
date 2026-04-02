import { describe, expect, it } from 'vitest'
import { initializeDatabase } from './db.js'
import { applyMigrations } from './migrate.js'
import { ToolPermissionRepository } from './toolPermissionRepository.js'

describe('ToolPermissionRepository', () => {
  function makeRepo() {
    const db = initializeDatabase(':memory:')
    applyMigrations(db)
    return new ToolPermissionRepository(db)
  }

  it('returns false when no permission exists', () => {
    const repo = makeRepo()
    expect(repo.hasPermission('project', 'input:echo hi && sudo ls')).toBe(false)
  })

  it('returns true after granting a permission with no expiry', () => {
    const repo = makeRepo()
    repo.grant('project', 'echo', 'input:echo hi', new Date().toISOString(), null)
    expect(repo.hasPermission('project', 'input:echo hi')).toBe(true)
  })

  it('returns true for permission with future expiry', () => {
    const repo = makeRepo()
    const future = new Date(Date.now() + 60_000).toISOString()
    repo.grant('project', 'echo', 'input:echo future', new Date().toISOString(), future)
    expect(repo.hasPermission('project', 'input:echo future')).toBe(true)
  })

  it('returns false for expired permission', () => {
    const repo = makeRepo()
    const past = new Date(Date.now() - 60_000).toISOString()
    repo.grant('project', 'echo', 'input:echo expired', new Date().toISOString(), past)
    expect(repo.hasPermission('project', 'input:echo expired')).toBe(false)
  })
})
