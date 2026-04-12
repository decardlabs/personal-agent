export type OpenUrlToolInput = {
  url: string
  /** Maximum characters to return from the response body (default: 4000). */
  maxChars?: number
  /** Injectable fetch implementation for testing. */
  fetchImpl?: (
    url: string,
    init?: { signal?: AbortSignal; headers?: Record<string, string> },
  ) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>
  /** Timeout in milliseconds (default: 10000). */
  timeoutMs?: number
}

export type OpenUrlToolResult = {
  output: string
}

const MAX_CHARS = 4000
const DEFAULT_TIMEOUT_MS = 10000

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
])

/**
 * Strips HTML tags and collapses whitespace to get readable plain text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function validateUrl(rawUrl: string): { valid: true; parsed: URL } | { valid: false; error: string } {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { valid: false, error: `Invalid URL: '${rawUrl}'` }
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, error: `Only http/https URLs are allowed, got: ${parsed.protocol}` }
  }

  const hostname = parsed.hostname.toLowerCase()
  if (BLOCKED_HOSTS.has(hostname)) {
    return { valid: false, error: `Blocked host: ${hostname}` }
  }

  // Block private IPv4 ranges (SSRF prevention)
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[01])\./.test(hostname)) {
    return { valid: false, error: `Private/internal IP ranges are not allowed: ${hostname}` }
  }

  return { valid: true, parsed }
}

/**
 * Fetches the text content of a public URL.
 * Blocked for localhost and private IPs to prevent SSRF.
 * This tool is always permission-gated in runTurn.ts.
 */
export async function runOpenUrlTool(input: OpenUrlToolInput): Promise<OpenUrlToolResult> {
  const validation = validateUrl(input.url)
  if (!validation.valid) {
    return { output: `Error: ${validation.error}` }
  }

  const maxChars = input.maxChars ?? MAX_CHARS
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchFn = input.fetchImpl ?? (globalThis.fetch as OpenUrlToolInput['fetchImpl'])

  if (!fetchFn) {
    return { output: 'Error: fetch is not available in this environment.' }
  }

  let controller: AbortController | null = null
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null

  try {
    controller = new AbortController()
    timeoutHandle = setTimeout(() => controller!.abort(), timeoutMs)

    const response = await fetchFn(input.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'personal-assistant/0.2 (CLI agent)',
        'Accept': 'text/html,text/plain,*/*',
      },
    })

    if (!response.ok) {
      return { output: `Error: HTTP ${response.status} from ${input.url}` }
    }

    const rawText = await response.text()
    const cleaned = stripHtml(rawText)
    const truncated = cleaned.length > maxChars
    const body = cleaned.slice(0, maxChars)

    const footer = truncated ? `\n...(truncated, ${cleaned.length - maxChars} more chars)` : ''
    return { output: `URL: ${input.url}\n\n${body}${footer}` }
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { output: `Error: request to ${input.url} timed out after ${timeoutMs}ms.` }
    }
    return { output: `Error: failed to fetch ${input.url}: ${String(err)}` }
  } finally {
    if (timeoutHandle !== null) {
      clearTimeout(timeoutHandle)
    }
  }
}
