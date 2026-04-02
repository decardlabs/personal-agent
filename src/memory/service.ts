export type MemoryScope = 'session' | 'context' | 'persistent'

export type MemoryEntry = {
  scope: MemoryScope
  key: string
  value: string
  confidence: number
  updatedAt: string
}

export interface MemoryService {
  get(scope: MemoryScope, key: string): MemoryEntry | null
  upsert(entry: MemoryEntry): void
}
