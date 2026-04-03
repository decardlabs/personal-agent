import pino from 'pino'

export function createLogger() {
  return pino({
    level: process.env.PA_LOG_LEVEL ?? 'info',
    base: {
      app: 'personal-assistant',
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  })
}
