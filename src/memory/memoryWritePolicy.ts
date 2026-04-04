/**
 * Memory Write-Back Policy
 * 
 * Provides confidence-based write-decision logic for persistent memory.
 * Ensures low-confidence writes are restricted and auditable.
 */

export type WriteDecisionResult = {
  allowed: boolean
  confidence: number
  reason: string
  minimumRequired: number
}

export type MemoryWritePolicy = {
  evaluateWrite: (key: string, value: string, proposedConfidence: number) => WriteDecisionResult
}

/**
 * Built-in confidence thresholds by key pattern or scope
 */
const CONFIDENCE_REQUIREMENTS: Record<string, number> = {
  // Special keys with high confidence requirements
  'last_echo_output': 0.7,      // Echo results are usually reliable
  '__last_consolidated_at': 1,  // Bookkeeping - always write
  // Catch-all for unknown keys
  '*': 0.5,                      // Default: moderate confidence threshold
}

/**
 * Get the minimum confidence required for a write operation
 */
function getMinimumConfidenceForKey(key: string): number {
  // Exact match first
  if (key in CONFIDENCE_REQUIREMENTS) {
    return CONFIDENCE_REQUIREMENTS[key]
  }

  // Return default wildcard threshold
  return CONFIDENCE_REQUIREMENTS['*']
}

/**
 * Create a memory write policy with confidence gating
 */
export function createMemoryWritePolicy(): MemoryWritePolicy {
  return {
    evaluateWrite: (key: string, value: string, proposedConfidence: number): WriteDecisionResult => {
      const minimumRequired = getMinimumConfidenceForKey(key)

      // Check if proposed confidence meets minimum requirement
      if (proposedConfidence >= minimumRequired) {
        return {
          allowed: true,
          confidence: proposedConfidence,
          reason: `confidence (${proposedConfidence.toFixed(2)}) meets minimum (${minimumRequired.toFixed(2)})`,
          minimumRequired,
        }
      }

      // Reject low-confidence writes
      return {
        allowed: false,
        confidence: proposedConfidence,
        reason: `confidence (${proposedConfidence.toFixed(2)}) below minimum (${minimumRequired.toFixed(2)})`,
        minimumRequired,
      }
    },
  }
}

/**
 * Special cases: some operations should always bypass confidence checks
 */
export function shouldBypassConfidenceCheck(key: string): boolean {
  // Bookkeeping keys should always be written
  return key.startsWith('__')
}

/**
 * Memory write audit entry for tracking write decisions
 */
export type MemoryWriteAuditEntry = {
  timestamp: string
  key: string
  value: string
  proposedConfidence: number
  decision: WriteDecisionResult
  firedAt: string // ISO timestamp of when this write decision was evaluated
}

/**
 * In-memory audit trail (can be extended to persist)
 */
export class MemoryWriteAuditTrail {
  private entries: MemoryWriteAuditEntry[] = []
  private maxEntries = 1000 // Cap audit trail size

  record(entry: MemoryWriteAuditEntry): void {
    this.entries.push(entry)
    // Keep buffer bounded
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries)
    }
  }

  getRecent(limit = 50): MemoryWriteAuditEntry[] {
    return this.entries.slice(-limit)
  }

  getByKey(key: string, limit = 100): MemoryWriteAuditEntry[] {
    return this.entries.filter(e => e.key === key).slice(-limit)
  }

  clear(): void {
    this.entries = []
  }

  size(): number {
    return this.entries.length
  }
}
