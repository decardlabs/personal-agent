import chalk from 'chalk'

export function colorSuccess(text: string): string {
  return chalk.green(text)
}

export function colorError(text: string): string {
  return chalk.red(text)
}

export function colorInfo(text: string): string {
  return chalk.blue(text)
}

export function colorWarn(text: string): string {
  return chalk.yellow(text)
}

export function colorMuted(text: string): string {
  return chalk.gray(text)
}

export function colorCommand(text: string): string {
  return chalk.cyan(text)
}

export function formatToolOutput(toolName: string, output: string): string {
  const header = colorCommand(`[${toolName}]`)
  return `${header}\n${output}`
}

export function formatPermissionDenied(): string {
  return colorError('Permission required for risky input. Re-run with explicit approval.')
}

export function formatPrompt(): string {
  return colorCommand('> ')
}

export function formatEchoResult(content: string): string {
  return colorSuccess(`Echo: ${content}`)
}

export function formatSearchResult(query: string, results: string): string {
  return `${colorCommand(`[search: ${query}]`)}\n${results}`
}

export function formatFileResult(path: string, content: string): string {
  return `${colorCommand(`[read: ${path}]`)}\n${content}`
}

export function formatPreferenceSet(key: string, value: string): string {
  return colorSuccess(`Preference set: ${colorInfo(key)} = ${colorInfo(value)}`)
}

export function formatPreferenceGet(key: string, value: string | null): string {
  if (value === null) {
    return colorWarn(`Preference '${key}' not set.`)
  }
  return `Preference ${colorInfo(key)} = ${colorInfo(value)}`
}
