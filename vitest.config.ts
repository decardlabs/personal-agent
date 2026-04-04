import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'openclaw/**',
      'deer-flow/**',
      'Claude-Code/**',
    ],
    env: {
      PA_LOG_LEVEL: 'silent',
    },
  },
})
