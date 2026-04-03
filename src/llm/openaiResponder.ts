import type { HistoryEntry } from '../memory/sessionMemory.js'

type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

type OpenAIChatResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

export type OpenAIResponderOptions = {
  apiKey: string
  model?: string
  fallbackModel?: string
  baseUrl?: string
  timeoutMs?: number
  maxRetries?: number
  temperature?: number
  maxOutputTokens?: number | null
  fetchImpl?: (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{
    ok: boolean
    status: number
    text(): Promise<string>
    json(): Promise<OpenAIChatResponse>
  }>
}

export type LLMResponderArgs = {
  input: string
  sessionId: string
  turnId: string
  rememberedLastEcho: string | null
  context: {
    cwd: string
    platform: string
    timestamp: string
    preferences: Array<{ key: string; value: string }>
  }
  history: HistoryEntry[]
  persistentFacts: Array<{
    key: string
    value: string
    confidence: number
    updatedAt: string
  }>
}

export function createOpenAIResponder(options: OpenAIResponderOptions): (args: LLMResponderArgs) => Promise<string> {
  const model = options.model ?? 'gpt-4o-mini'
  const fallbackModel = options.fallbackModel ?? null
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1'
  const timeoutMs = options.timeoutMs ?? 20000
  const maxRetries = options.maxRetries ?? 1
  const temperature = options.temperature ?? 0.2
  const maxOutputTokens = options.maxOutputTokens ?? null
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as OpenAIResponderOptions['fetchImpl'])

  if (!fetchImpl) {
    throw new Error('No fetch implementation available for OpenAI responder')
  }

  return async (args: LLMResponderArgs): Promise<string> => {
    const { input, context, history, rememberedLastEcho, persistentFacts } = args

    const prefLines = context.preferences.length > 0
      ? context.preferences.map(p => `  ${p.key}: ${p.value}`).join('\n')
      : '  (none)'

    const systemContent = [
      'You are a concise and helpful assistant in a CLI environment.',
      '',
      `Context:`,
      `  cwd: ${context.cwd}`,
      `  platform: ${context.platform}`,
      `  timestamp: ${context.timestamp}`,
      rememberedLastEcho ? `  last echo: ${rememberedLastEcho}` : null,
      '',
      'User preferences:',
      prefLines,
      '',
      'Persistent facts:',
      persistentFacts.length > 0
        ? persistentFacts
          .map(fact => `  ${fact.key}=${fact.value} (confidence=${fact.confidence.toFixed(2)})`)
          .join('\n')
        : '  (none)',
    ].filter(line => line !== null).join('\n')

    const messages: ChatMessage[] = [
      { role: 'system', content: systemContent },
    ]

    // Inject history as alternating user/assistant messages
    for (const entry of history) {
      messages.push({ role: 'user', content: entry.input })
      messages.push({ role: 'assistant', content: entry.response })
    }

    messages.push({ role: 'user', content: input })

    const modelCandidates = [model, fallbackModel].filter((value, idx, arr): value is string =>
      Boolean(value) && arr.indexOf(value) === idx,
    )

    const isRetryableStatus = (status: number): boolean =>
      [408, 429, 500, 502, 503, 504].includes(status)

    let lastError: Error | null = null

    for (const selectedModel of modelCandidates) {
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const controller = new AbortController()
        const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs)
        try {
          const response = await fetchImpl(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${options.apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: selectedModel,
              messages,
              temperature,
              max_tokens: maxOutputTokens ?? undefined,
            }),
            signal: controller.signal,
          })

          if (!response.ok) {
            const body = await response.text()
            if (attempt < maxRetries && isRetryableStatus(response.status)) {
              continue
            }
            throw new Error(
              `OpenAI request failed (model=${selectedModel}) with status ${response.status}: ${body}`,
            )
          }

          const data = await response.json()
          const content = data.choices?.[0]?.message?.content?.trim()
          if (!content) {
            throw new Error(`OpenAI response missing message content (model=${selectedModel})`)
          }

          return content
        } catch (error) {
          const err = error instanceof Error ? error : new Error(String(error))
          lastError = err
          if (attempt >= maxRetries) {
            break
          }
        } finally {
          clearTimeout(timeoutHandle)
        }
      }
    }

    throw lastError ?? new Error('OpenAI request failed without a concrete error')
  }
}
