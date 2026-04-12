import { describe, expect, it, vi } from 'vitest'
import {
  buildBuiltInToolCalledPayload,
  createBuiltInToolRequest,
  executeBuiltInTool,
  formatBuiltInToolResponse,
  getBuiltInToolMetadata,
} from './toolCatalog.js'

describe('toolCatalog', () => {
  it('creates builtin tool requests in priority order', () => {
    const request = createBuiltInToolRequest({
      echoPayload: 'hello',
      searchPayload: 'runTurn',
    })

    expect(request).toEqual({
      toolName: 'echo',
      args: { content: 'hello' },
    })
  })

  it('builds stable tool_called payloads', () => {
    const request = createBuiltInToolRequest({ readFilePayload: 'src/index.ts' })
    expect(request).not.toBeNull()
    expect(buildBuiltInToolCalledPayload(request!)).toEqual({
      toolName: 'read-file',
      filePath: 'src/index.ts',
    })
  })

  it('formats tool responses using catalog rules', () => {
    const request = createBuiltInToolRequest({ listDirPayload: 'src' })
    expect(request).not.toBeNull()
    expect(formatBuiltInToolResponse(request!, 'a\nb')).toBe('Directory listing:\na\nb')
  })

  it('executes builtin tools through runner overrides', async () => {
    const request = createBuiltInToolRequest({ openUrlPayload: 'https://example.com' })
    const openUrlToolRunner = vi.fn(async () => ({ output: 'ok' }))

    const result = await executeBuiltInTool(request!, { openUrlToolRunner })

    expect(result.output).toBe('ok')
    expect(openUrlToolRunner).toHaveBeenCalledWith({ url: 'https://example.com' })
  })

  it('exposes per-tool execution metadata', () => {
    expect(getBuiltInToolMetadata('open-url')).toEqual({
      toolName: 'open-url',
      capabilityClass: 'network-read',
      executionMode: 'async',
      defaultMaxRetries: 0,
    })
  })
})