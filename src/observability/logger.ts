import pino from 'pino'

export function createLogger() {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: {
      app: 'personal-assistant',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  })
}
