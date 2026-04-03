import { PreferenceRepository } from '../storage/preferenceRepository.js'

const DEFAULT_USER = 'default'

export class PreferenceStore {
  constructor(
    private readonly repository: PreferenceRepository,
    private readonly userId: string = DEFAULT_USER,
  ) {}

  get(key: string): string | null {
    return this.repository.get(this.userId, key)
  }

  set(key: string, value: string): void {
    this.repository.set(this.userId, key, value)
  }

  listAll(): Array<{ key: string; value: string }> {
    return this.repository.listAll(this.userId)
  }

  delete(key: string): void {
    this.repository.delete(this.userId, key)
  }
}
