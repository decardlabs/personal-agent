export type EchoToolInput = {
  content: string
}

export type EchoToolResult = {
  output: string
}

export function runEchoTool(input: EchoToolInput): EchoToolResult {
  return {
    output: input.content,
  }
}
