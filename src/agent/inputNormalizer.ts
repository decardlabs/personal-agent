export function normalizeInput(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}

export function detectEchoCommand(input: string): string | null {
  const normalized = normalizeInput(input)
  if (!normalized.toLowerCase().startsWith('echo ')) {
    return null
  }

  const content = normalized.slice(5).trim()
  return content.length > 0 ? content : null
}

export function detectSearchCommand(input: string): string | null {
  const normalized = normalizeInput(input)
  if (!normalized.toLowerCase().startsWith('search ')) {
    return null
  }

  const query = normalized.slice(7).trim()
  return query.length > 0 ? query : null
}

/**
 * Returns the file path argument if the input matches "read <path>" or
 * "read file <path>", otherwise null.
 */
export function detectReadFileCommand(input: string): string | null {
  const normalized = normalizeInput(input)
  const lower = normalized.toLowerCase()

  if (lower.startsWith('read file ')) {
    const path = normalized.slice(10).trim()
    return path.length > 0 ? path : null
  }

  if (lower.startsWith('read ')) {
    const path = normalized.slice(5).trim()
    return path.length > 0 ? path : null
  }

  return null
}

/**
 * Returns `{ key, value }` if the input matches "set preference <key> <value>",
 * otherwise null.
 */
export function detectSetPreferenceCommand(input: string): { key: string; value: string } | null {
  const normalized = normalizeInput(input)
  const lower = normalized.toLowerCase()
  const prefix = 'set preference '
  if (!lower.startsWith(prefix)) {
    return null
  }
  const rest = normalized.slice(prefix.length).trim()
  const spaceIdx = rest.indexOf(' ')
  if (spaceIdx === -1) {
    return null
  }
  const key = rest.slice(0, spaceIdx).trim()
  const value = rest.slice(spaceIdx + 1).trim()
  return key.length > 0 && value.length > 0 ? { key, value } : null
}

/**
 * Returns the preference key string if the input matches "get preference <key>",
 * otherwise null.
 */
export function detectGetPreferenceCommand(input: string): string | null {
  const normalized = normalizeInput(input)
  const lower = normalized.toLowerCase()
  const prefix = 'get preference '
  if (!lower.startsWith(prefix)) {
    return null
  }
  const key = normalized.slice(prefix.length).trim()
  return key.length > 0 ? key : null
}

/**
 * Returns the directory path if the input matches "list <dir>" or "ls <dir>",
 * otherwise null. A bare "list" or "ls" (no argument) returns ".".
 * The argument must look like a path: single token, starts with "." or "/",
 * or contains "/" to avoid capturing natural-language sentences.
 */
export function detectListDirCommand(input: string): string | null {
  const normalized = normalizeInput(input)
  const lower = normalized.toLowerCase()

  if (lower === 'list' || lower === 'ls') {
    return '.'
  }

  for (const prefix of ['list ', 'ls ']) {
    if (lower.startsWith(prefix)) {
      const path = normalized.slice(prefix.length).trim()
      if (path.length > 0 && isPathLike(path)) {
        return path
      }
    }
  }

  return null
}

/**
 * Returns the file path if the input matches "summarize <file>" or
 * "summarise <file>", otherwise null.
 * The argument must look like a file path to avoid catching natural-language
 * inputs like "summarize memory facts" intended for the LLM.
 */
export function detectSummarizeCommand(input: string): string | null {
  const normalized = normalizeInput(input)
  const lower = normalized.toLowerCase()

  for (const prefix of ['summarize ', 'summarise ']) {
    if (lower.startsWith(prefix)) {
      const path = normalized.slice(prefix.length).trim()
      if (path.length > 0 && isPathLike(path)) {
        return path
      }
    }
  }

  return null
}

/**
 * Returns true if the token looks like a file/directory path rather than a
 * natural-language phrase. Heuristics (any one suffices):
 * - No spaces (single token)
 * - Contains "/"
 * - Starts with "." or ".."
 */
function isPathLike(token: string): boolean {
  if (!token.includes(' ')) {
    return true
  }
  if (token.includes('/')) {
    return true
  }
  if (token.startsWith('.')) {
    return true
  }
  return false
}

/**
 * Returns the URL string if the input matches "open <url>" or "fetch <url>",
 * otherwise null.
 */
export function detectOpenUrlCommand(input: string): string | null {
  const normalized = normalizeInput(input)
  const lower = normalized.toLowerCase()

  for (const prefix of ['open ', 'fetch ']) {
    if (lower.startsWith(prefix)) {
      const url = normalized.slice(prefix.length).trim()
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url
      }
    }
  }

  return null
}
