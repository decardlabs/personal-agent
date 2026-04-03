import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      PA_LOG_LEVEL: 'silent',
    },
  },
})
