import { runEchoTool, type EchoToolResult } from './echoTool.js'
import { runSearchTool, type SearchToolResult } from './searchTool.js'
import { runReadFileTool, type ReadFileToolResult } from './readFileTool.js'
import { runListDirTool, type ListDirToolResult } from './listDirTool.js'
import { runOpenUrlTool, type OpenUrlToolResult } from './openUrlTool.js'

export type BuiltInToolName = 'echo' | 'search' | 'read-file' | 'list-dir' | 'open-url'

export type BuiltInToolRequest =
  | { toolName: 'echo'; args: { content: string } }
  | { toolName: 'search'; args: { query: string } }
  | { toolName: 'read-file'; args: { filePath: string } }
  | { toolName: 'list-dir'; args: { dirPath: string } }
  | { toolName: 'open-url'; args: { url: string } }

export type BuiltInToolRunnerOverrides = {
  echoToolRunner?: (args: { content: string }) => EchoToolResult
  searchToolRunner?: (args: { query: string }) => SearchToolResult
  readFileToolRunner?: (args: { filePath: string }) => ReadFileToolResult
  listDirToolRunner?: (args: { dirPath: string }) => ListDirToolResult
  openUrlToolRunner?: (args: { url: string }) => Promise<OpenUrlToolResult>
}

export type BuiltInToolExecutionMetadata = {
  toolName: BuiltInToolName
  capabilityClass: 'local-read' | 'network-read'
  executionMode: 'sync' | 'async'
  defaultMaxRetries: number
}

const BUILT_IN_TOOL_METADATA: Record<BuiltInToolName, BuiltInToolExecutionMetadata> = {
  echo: {
    toolName: 'echo',
    capabilityClass: 'local-read',
    executionMode: 'sync',
    defaultMaxRetries: 0,
  },
  search: {
    toolName: 'search',
    capabilityClass: 'local-read',
    executionMode: 'sync',
    defaultMaxRetries: 0,
  },
  'read-file': {
    toolName: 'read-file',
    capabilityClass: 'local-read',
    executionMode: 'sync',
    defaultMaxRetries: 0,
  },
  'list-dir': {
    toolName: 'list-dir',
    capabilityClass: 'local-read',
    executionMode: 'sync',
    defaultMaxRetries: 0,
  },
  'open-url': {
    toolName: 'open-url',
    capabilityClass: 'network-read',
    executionMode: 'async',
    defaultMaxRetries: 0,
  },
}

export function createBuiltInToolRequest(args: {
  echoPayload?: string | null
  searchPayload?: string | null
  readFilePayload?: string | null
  listDirPayload?: string | null
  openUrlPayload?: string | null
}): BuiltInToolRequest | null {
  if (args.echoPayload) {
    return { toolName: 'echo', args: { content: args.echoPayload } }
  }
  if (args.searchPayload) {
    return { toolName: 'search', args: { query: args.searchPayload } }
  }
  if (args.readFilePayload) {
    return { toolName: 'read-file', args: { filePath: args.readFilePayload } }
  }
  if (args.listDirPayload) {
    return { toolName: 'list-dir', args: { dirPath: args.listDirPayload } }
  }
  if (args.openUrlPayload) {
    return { toolName: 'open-url', args: { url: args.openUrlPayload } }
  }
  return null
}

export function getBuiltInToolMetadata(toolName: BuiltInToolName): BuiltInToolExecutionMetadata {
  return BUILT_IN_TOOL_METADATA[toolName]
}

export function buildBuiltInToolCalledPayload(request: BuiltInToolRequest): Record<string, unknown> {
  switch (request.toolName) {
    case 'echo':
      return { toolName: request.toolName, content: request.args.content }
    case 'search':
      return { toolName: request.toolName, query: request.args.query }
    case 'read-file':
      return { toolName: request.toolName, filePath: request.args.filePath }
    case 'list-dir':
      return { toolName: request.toolName, dirPath: request.args.dirPath }
    case 'open-url':
      return { toolName: request.toolName, url: request.args.url }
  }
}

export async function executeBuiltInTool(
  request: BuiltInToolRequest,
  runners: BuiltInToolRunnerOverrides = {},
): Promise<{ output: string }> {
  switch (request.toolName) {
    case 'echo':
      return (runners.echoToolRunner ?? runEchoTool)(request.args)
    case 'search':
      return (runners.searchToolRunner ?? runSearchTool)(request.args)
    case 'read-file':
      return (runners.readFileToolRunner ?? runReadFileTool)(request.args)
    case 'list-dir':
      return (runners.listDirToolRunner ?? runListDirTool)(request.args)
    case 'open-url':
      return (runners.openUrlToolRunner ?? runOpenUrlTool)(request.args)
  }
}

export function formatBuiltInToolResponse(request: BuiltInToolRequest, output: string): string {
  switch (request.toolName) {
    case 'echo':
      return `Echo: ${output}`
    case 'search':
      return `Search results:\n${output}`
    case 'read-file':
      return `File:\n${output}`
    case 'list-dir':
      return `Directory listing:\n${output}`
    case 'open-url':
      return `Fetched content:\n${output}`
  }
}