import type { IntentJournalBatchIdItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import type { JournalBatchRecord } from '@/services/payout-command/prod-api/mapIntentEngineBatch'
import {
  JOURNAL_DEFAULT_CURRENCY,
  resolveBatchTotalAmountMinor,
} from '@/services/payout-command/prod-api/money/journalMoney'

/** Parse batch total from Service 2 batch-ids into minor units (convert major once). */
export function parseIntentBatchTotalAmountMinor(
  item: IntentJournalBatchIdItem | Record<string, unknown>,
): number {
  return resolveBatchTotalAmountMinor({
    total_amount_minor:
      'total_amount_minor' in item
        ? (item.total_amount_minor as number | string | null | undefined)
        : undefined,
    total_amount:
      'total_amount' in item ? (item.total_amount as number | string | null | undefined) : undefined,
  })
}

/** Minimal sidebar row from batch-ids list (counts/value enriched after batch select). */
export function mapBatchIdItemToBatchRecord(item: IntentJournalBatchIdItem): JournalBatchRecord {
  const batchId = String(item.batch_id ?? '').trim() || '—'
  return {
    batchId,
    type: 'Disbursement',
    apiType: '—',
    source: 'Intent engine',
    amountMinor: parseIntentBatchTotalAmountMinor(item),
    currency: JOURNAL_DEFAULT_CURRENCY,
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
    intendedAmountMinor: number
    batchAggregateConfidenceScore: number | null
    reviewCount: number
  },
): JournalBatchRecord {
  const amountMinor =
    base.amountMinor > 0
      ? base.amountMinor
      : metrics.intendedAmountMinor > 0
        ? metrics.intendedAmountMinor
        : base.amountMinor
  return {
    ...base,
    transactions: metrics.instructionCount ?? base.transactions,
    amountMinor,
    aggregateConfidenceScore: metrics.batchAggregateConfidenceScore ?? undefined,
  }
}

