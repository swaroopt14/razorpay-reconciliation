import type { IntelligenceBatchRow } from '@/services/payout-command/prod-api/intelligenceTypes'
import { coerceMinor } from './formatMinorInr'

/** Batch list rows expose review amounts under several field names depending on API version. */
export function batchReviewAmountMinor(row: IntelligenceBatchRow): number {
  const candidates = [
    row.unmatched_amount_minor,
    row.value_at_risk_minor,
    row.unexplained_variance_minor,
    row.total_variance_minor,
  ]
  for (const field of candidates) {
    const minor = coerceMinor(field)
    if (minor > 0) return minor
  }
  return 0
}
