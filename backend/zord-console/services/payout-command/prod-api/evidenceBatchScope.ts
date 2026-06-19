import { apiTrimmedString } from './coerceApiField'
import type { IntelligenceBatchRow } from './intelligenceTypes'

/** Placeholder row when a batch id is known from the journal but not yet in intelligence. */
export function stubIntelligenceBatchRow(batchId: string, tenantId = ''): IntelligenceBatchRow {
  return {
    batch_id: batchId,
    tenant_id: tenantId,
    finality_status: 'PENDING',
    total_count: 0,
    success_count: 0,
    failed_count: 0,
    pending_count: 0,
  }
}

/**
 * Evidence packs are keyed by batch_id in zord-evidence, but the console batch
 * dropdown is seeded from intelligence. Keep a user- or URL-pinned batch even
 * when intelligence has not projected that batch yet.
 */
export function pickEvidenceBatchId(
  intelligenceBatches: IntelligenceBatchRow[],
  preferredBatchId: string,
): string {
  const preferred = apiTrimmedString(preferredBatchId)
  if (!intelligenceBatches.length) return preferred
  if (preferred) return preferred
  return apiTrimmedString(intelligenceBatches[0]?.batch_id)
}

/** Ensures the active batch appears in the selector when it exists only in evidence. */
export function intelligenceBatchesForSelector(
  batches: IntelligenceBatchRow[],
  selectedBatchId: string,
  tenantId: string,
): IntelligenceBatchRow[] {
  const bid = apiTrimmedString(selectedBatchId)
  if (!bid || batches.some((b) => apiTrimmedString(b.batch_id) === bid)) return batches
  return [stubIntelligenceBatchRow(bid, tenantId), ...batches]
}
