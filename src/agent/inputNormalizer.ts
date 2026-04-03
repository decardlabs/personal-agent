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
