import type { IntentJournalBatchIdItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import type { JournalBatchRecord } from '@/services/payout-command/prod-api/mapIntentEngineBatch'

/** Parse `total_amount` from intent-engine GET /api/prod/intents/batch-ids items. */
export function parseIntentBatchTotalAmount(item: IntentJournalBatchIdItem | Record<string, unknown>): number {
  const raw = 'total_amount' in item ? item.total_amount : undefined
  const n = typeof raw === 'number' ? raw : Number.parseFloat(String(raw ?? '').replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/** Minimal sidebar row from batch-ids list (counts/value enriched after batch select). */
export function mapBatchIdItemToBatchRecord(item: IntentJournalBatchIdItem): JournalBatchRecord {
  const batchId = String(item.batch_id ?? '').trim() || '—'
  return {
    batchId,
    type: 'Disbursement',
    apiType: '—',
    source: 'Intent engine',
    totalValue: parseIntentBatchTotalAmount(item),
    transactions: 0,
    confirmedCount: 0,
    highConfidenceCount: 0,
    mismatchCount: 0,
    unresolvedCount: 0,
    engineSidebar: true,
  }
}

/** Merge derived metrics from payment-intents + dlq into a batch sidebar record. */
export function enrichBatchRecordWithMetrics(
  base: JournalBatchRecord,
  metrics: {
    instructionCount: number | null
    intendedValue: number
    batchAggregateConfidenceScore: number | null
    reviewCount: number
  },
): JournalBatchRecord {
  const totalValue =
    base.totalValue > 0
      ? base.totalValue
      : metrics.intendedValue > 0
        ? metrics.intendedValue
        : base.totalValue
  return {
    ...base,
    transactions: metrics.instructionCount ?? base.transactions,
    totalValue,
    aggregateConfidenceScore: metrics.batchAggregateConfidenceScore ?? undefined,
  }
}
