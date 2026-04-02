import { MemoryFactRepository } from '../storage/memoryFactRepository.js'

const DEFAULT_SCOPE = 'persistent'

export class PersistentMemoryStore {
  constructor(private readonly repository: MemoryFactRepository) {}

  get(key: string): string | null {
    const row = this.repository.get(DEFAULT_SCOPE, key)
    if (!row) {
      return null
    }

    return typeof row.value === 'string' ? row.value : JSON.stringify(row.value)
  }

  set(key: string, value: string, confidence = 1): void {
    this.repository.upsert(
      DEFAULT_SCOPE,
      key,
      value,
      confidence,
      new Date().toISOString(),
    )
  }
}
