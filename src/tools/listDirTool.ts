import { readdirSync, statSync, existsSync } from 'node:fs'
import { resolve, relative, isAbsolute, join } from 'node:path'

export type ListDirToolInput = {
  dirPath: string
  /** Root directory that paths are resolved relative to (defaults to cwd). */
  rootDir?: string
  /** Maximum number of entries to return (default: 100). */
  maxEntries?: number
}

export type ListDirToolResult = {
  output: string
}

const MAX_ENTRIES = 100

/**
 * Lists the contents of a directory inside the project root.
 * Path traversal outside the project root is rejected for security.
 */
export function runListDirTool(input: ListDirToolInput): ListDirToolResult {
  const rootDir = resolve(input.rootDir ?? process.cwd())
  const resolvedPath = isAbsolute(input.dirPath)
    ? resolve(input.dirPath)
    : resolve(rootDir, input.dirPath)

  // Security: reject traversal outside project root
  const relPath = relative(rootDir, resolvedPath)
  if (relPath.startsWith('..') || isAbsolute(relPath)) {
    return { output: `Error: path '${input.dirPath}' is outside the project root.` }
  }

  if (!existsSync(resolvedPath)) {
    return { output: `Error: directory not found: ${relPath || '.'}` }
  }

  let stat: ReturnType<typeof statSync>
  try {
    stat = statSync(resolvedPath)
  } catch {
    return { output: `Error: could not stat path: ${relPath || '.'}` }
  }

  if (!stat.isDirectory()) {
    return { output: `Error: '${relPath || '.'}' is not a directory.` }
  }

  let entryNames: Array<{ name: string; isDir: boolean }>
  try {
    const raw = readdirSync(resolvedPath, { withFileTypes: true })
    entryNames = raw.map(e => ({ name: e.name as string, isDir: e.isDirectory() }))
  } catch {
    return { output: `Error: could not read directory: ${relPath || '.'}` }
  }

  const maxEntries = input.maxEntries ?? MAX_ENTRIES
  const sorted = [...entryNames].sort((a, b) => {
    // Directories first, then files, alphabetically within each group
    if (a.isDir !== b.isDir) {
      return a.isDir ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })

  const limited = sorted.slice(0, maxEntries)
  const truncated = sorted.length > maxEntries

  const lines = limited.map(entry => {
    const suffix = entry.isDir ? '/' : ''
    return `  ${entry.name}${suffix}`
  })

  const displayPath = relPath || '.'
  const header = `Directory: ${displayPath} (${sorted.length} entries)\n`
  const body = lines.join('\n')
  const footer = truncated
    ? `\n...(truncated, ${sorted.length - maxEntries} more entries)`
    : ''

  return { output: header + body + footer }
}
