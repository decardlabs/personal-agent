export type ContextSnapshot = {
  cwd: string
  platform: NodeJS.Platform
  timestamp: string
}

export function getContextSnapshot(): ContextSnapshot {
  return {
    cwd: process.cwd(),
    platform: process.platform,
    timestamp: new Date().toISOString(),
  }
}
