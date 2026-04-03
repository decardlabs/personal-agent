import { readFileSync, existsSync } from 'node:fs'
import { resolve, relative, isAbsolute } from 'node:path'

export type ReadFileToolInput = {
  filePath: string
  /** If provided, only return lines [startLine, endLine] (1-based, inclusive). */
  startLine?: number
  endLine?: number
  /** Root directory that paths are resolved relative to (defaults to cwd). */
  rootDir?: string
}

export type ReadFileToolResult = {
  output: string
}

const MAX_LINES = 200

/**
 * Reads a file inside the project root and returns its content.
 * Path traversal outside the project root is rejected for security.
 */
export function runReadFileTool(input: ReadFileToolInput): ReadFileToolResult {
  const rootDir = resolve(input.rootDir ?? process.cwd())
  const resolvedPath = isAbsolute(input.filePath)
    ? resolve(input.filePath)
    : resolve(rootDir, input.filePath)

  // Security: reject traversal outside project root
  const relPath = relative(rootDir, resolvedPath)
  if (relPath.startsWith('..') || isAbsolute(relPath)) {
    return { output: `Error: path '${input.filePath}' is outside the project root.` }
  }

  if (!existsSync(resolvedPath)) {
    return { output: `Error: file not found: ${relPath}` }
  }

  let lines: string[]
  try {
    lines = readFileSync(resolvedPath, 'utf-8').split('\n')
  } catch {
    return { output: `Error: could not read file: ${relPath}` }
  }

  const start = Math.max(1, input.startLine ?? 1)
  const end = Math.min(lines.length, input.endLine ?? MAX_LINES)
  const selected = lines.slice(start - 1, end)

  const truncated = selected.length < lines.length
  const header = `File: ${relPath} (lines ${start}-${end} of ${lines.length})\n`
  const body = selected.join('\n')
  const footer = truncated ? `\n...(truncated, ${lines.length - end} more lines)` : ''

  return { output: header + body + footer }
}
