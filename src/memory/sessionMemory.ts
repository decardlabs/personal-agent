export type HistoryEntry = {
  input: string
  response: string
}

const DEFAULT_HISTORY_WINDOW = 10

export class SessionMemoryStore {
  private readonly entries = new Map<string, Map<string, string>>()
  private readonly history = new Map<string, HistoryEntry[]>()

  constructor(private readonly historyWindowSize: number = DEFAULT_HISTORY_WINDOW) {}

  get(sessionId: string, key: string): string | null {
    const session = this.entries.get(sessionId)
    if (!session) {
      return null
    }
    return session.get(key) ?? null
  }

  set(sessionId: string, key: string, value: string): void {
    const current = this.entries.get(sessionId)
    if (current) {
      current.set(key, value)
      return
    }

    this.entries.set(
      sessionId,
      new Map<string, string>([
        [key, value],
      ]),
    )
  }

  pushHistory(sessionId: string, entry: HistoryEntry): void {
    const list = this.history.get(sessionId) ?? []
    list.push(entry)
    if (list.length > this.historyWindowSize) {
      list.splice(0, list.length - this.historyWindowSize)
    }
    this.history.set(sessionId, list)
  }

  getHistory(sessionId: string): HistoryEntry[] {
    return this.history.get(sessionId) ?? []
  }
}
