type ChatMessage = {
  role: 'system' | 'user'
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
  baseUrl?: string
  fetchImpl?: (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
    ok: boolean
    status: number
    text(): Promise<string>
    json(): Promise<OpenAIChatResponse>
  }>
}

export function createOpenAIResponder(options: OpenAIResponderOptions): (prompt: string) => Promise<string> {
  const model = options.model ?? 'gpt-4o-mini'
  const baseUrl = options.baseUrl ?? 'https://api.openai.com/v1'
  const fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as OpenAIResponderOptions['fetchImpl'])

  if (!fetchImpl) {
    throw new Error('No fetch implementation available for OpenAI responder')
  }

  return async (prompt: string): Promise<string> => {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: 'You are a concise and helpful assistant in a CLI environment.',
      },
      {
        role: 'user',
        content: prompt,
      },
    ]

    const response = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI request failed with status ${response.status}: ${await response.text()}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content?.trim()
    if (!content) {
      throw new Error('OpenAI response missing message content')
    }

    return content
  }
}
