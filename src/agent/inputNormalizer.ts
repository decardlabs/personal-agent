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
