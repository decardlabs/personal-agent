import { readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative, resolve } from 'node:path'

export type SearchToolInput = {
  query: string
  rootDir?: string
  maxResults?: number
}

export type SearchToolResult = {
  output: string
}

const IGNORED_DIRS = new Set(['.git', 'node_modules', 'dist', 'data'])
const SEARCHABLE_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.json',
  '.md',
  '.sql',
  '.yml',
  '.yaml',
  '.txt',
])

function collectFiles(rootDir: string): string[] {
  const files: string[] = []
  const stack = [rootDir]

  while (stack.length > 0) {
    const currentDir = stack.pop()
    if (!currentDir) {
      continue
    }

    const entries = readdirSync(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = join(currentDir, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          stack.push(absolutePath)
        }
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      if (SEARCHABLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
        files.push(absolutePath)
      }
    }
  }

  return files
}

export function runSearchTool(input: SearchToolInput): SearchToolResult {
  const rootDir = resolve(input.rootDir ?? process.cwd())
  const maxResults = input.maxResults ?? 5
  const normalizedQuery = input.query.trim()

  if (!normalizedQuery) {
    return { output: 'Search query cannot be empty.' }
  }

  const query = normalizedQuery.toLowerCase()
  const matches: string[] = []

  for (const file of collectFiles(rootDir)) {
    const content = readFileSync(file, 'utf8')
    const lines = content.split(/\r?\n/)

    for (let index = 0; index < lines.length; index++) {
      if (lines[index].toLowerCase().includes(query)) {
        matches.push(`${relative(rootDir, file)}:${index + 1}: ${lines[index].trim()}`)
        if (matches.length >= maxResults) {
          return { output: matches.join('\n') }
        }
      }
    }
  }

  if (matches.length === 0) {
    return { output: `No matches found for "${normalizedQuery}".` }
  }

  return { output: matches.join('\n') }
}
