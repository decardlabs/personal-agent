import type Database from 'better-sqlite3'

type ToolPermissionRow = {
  id: number
}

export class ToolPermissionRepository {
  constructor(private readonly db: Database.Database) {}

  hasPermission(scope: string, permissionKey: string): boolean {
    const row = this.db
      .prepare(
        `SELECT id
         FROM tool_permissions
         WHERE scope = ? AND permission_key = ?
         LIMIT 1`,
      )
      .get(scope, permissionKey) as ToolPermissionRow | undefined

    return Boolean(row)
  }

  grant(
    scope: string,
    toolName: string,
    permissionKey: string,
    grantedAt: string,
    expiresAt: string | null = null,
  ): void {
    this.db
      .prepare(
        `INSERT INTO tool_permissions (scope, tool_name, permission_key, granted_at, expires_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(scope, permission_key)
         DO UPDATE SET
           tool_name = excluded.tool_name,
           granted_at = excluded.granted_at,
           expires_at = excluded.expires_at`,
      )
      .run(scope, toolName, permissionKey, grantedAt, expiresAt)
  }
}
