export class SessionMemoryStore {
  private readonly entries = new Map<string, Map<string, string>>()

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
}
