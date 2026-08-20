import type { IntentJournalPaymentIntentItem, IntentJournalDlqItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import { readIntentQualityScore } from '@/services/payout-command/prod-api/resolveIntentQualityScore'
import { READINESS_REVIEW_THRESHOLD } from '../mappers/mapIntentTableRow'
import {
  JOURNAL_DEFAULT_CURRENCY,
  majorAmountToMinor,
  normalizeJournalCurrency,
} from '@/services/payout-command/prod-api/money/journalMoney'

export const DLQ_STATUS_MANUAL_REVIEW = 'NEEDS_MANUAL_REVIEW'

export type IntentBatchMetrics = {
  /** Authoritative count from payment-intents `pagination.total`; null when API total missing. */
  instructionCount: number | null
  /** Batch total in minor units — from batch-ids or sum of payment-intent amounts. */
  intendedAmountMinor: number
  currency: string
  avgReadinessPct: number | null
  /** Batch aggregate from intent-engine `aggregate_confidence_score` (0–1). */
  batchAggregateConfidenceScore: number | null
  /** Quality risk only — never added into needsReviewCount (CON-P1-23). */
  lowReadinessCount: number
  /** Unique DLQ rows (any status) by intent/source-row identity. */
  dlqCount: number
  /**
   * Unique manual-review queue size.
   * Prefer `manualReviewApiTotal` from GET /api/prod/dlq/manual-review; else unique NEEDS_MANUAL_REVIEW identities.
   */
  manualReviewCount: number
  /** Authoritative review queue = manualReviewCount (not dlq + low quality). */
  needsReviewCount: number
  /** Unique non–manual-review DLQ identities (processing/validation failures). */
  processingFailedCount: number
  /** Provenance for needsReviewCount. */
  needsReviewSource: 'dlq.manual-review.pagination.total' | 'dlq.NEEDS_MANUAL_REVIEW.unique'
}

function normalizeQualityPct(score: number): number {
  return score <= 1 ? score * 100 : score
}

/** Stable identity for unique review/quality counting (intent → source row → payout ref → dlq). */
export function intentOrSourceRowIdentity(input: {
  intentId?: string | null
  sourceRowNum?: number | null
  clientPayoutRef?: string | null
  dlqId?: string | null
  intentContext?: Record<string, unknown> | null
}): string | null {
  const ctx = input.intentContext
  const ctxIntent =
    ctx && typeof ctx.intent_id === 'string' ? ctx.intent_id.trim() : ''
  const intentId = (input.intentId ?? '').trim() || ctxIntent
  if (intentId) return `intent:${intentId}`

  const row =
    input.sourceRowNum != null && Number.isFinite(input.sourceRowNum)
      ? Number(input.sourceRowNum)
      : ctx && typeof ctx.source_row_num === 'number'
        ? ctx.source_row_num
        : null
  if (row != null) return `source_row:${row}`

  const payout =
    (input.clientPayoutRef ?? '').trim() ||
    (ctx && typeof ctx.client_payout_ref === 'string' ? ctx.client_payout_ref.trim() : '')
  if (payout) return `payout_ref:${payout}`

  const dlqId = (input.dlqId ?? '').trim()
  if (dlqId) return `dlq:${dlqId}`
  return null
}

function dlqIdentity(item: IntentJournalDlqItem): string {
  return (
    intentOrSourceRowIdentity({
      sourceRowNum: item.source_row_num,
      dlqId: item.dlq_id,
      intentContext: item.intent_context ?? null,
    }) ?? `dlq:${item.dlq_id}`
  )
}

function paymentIntentIdentity(item: IntentJournalPaymentIntentItem, index: number): string {
  return (
    intentOrSourceRowIdentity({
      intentId: item.intent_id,
      sourceRowNum: item.source_row_num,
      clientPayoutRef: item.client_payout_ref,
    }) ?? `intent_index:${index}`
  )
}

function uniqueCount(ids: Iterable<string>): number {
  return new Set(ids).size
}

export type DeriveIntentBatchMetricsOptions = {
  /** Authoritative batch intent count from payment-intents `pagination.total`. */
  paymentIntentTotal?: number | null
  /** Authoritative batch value already in minor units. */
  batchTotalAmountMinor?: number | null
  currency?: string | null
  /**
   * Batch-scoped count from GET /api/prod/dlq/manual-review (`pagination.total` or filtered items).
   * When set, becomes needsReviewCount / manualReviewCount.
   */
  manualReviewApiTotal?: number | null
}

export function deriveIntentBatchMetrics(
  paymentIntents: IntentJournalPaymentIntentItem[],
  dlqItems: IntentJournalDlqItem[],
  options?: DeriveIntentBatchMetricsOptions,
): IntentBatchMetrics {
  const apiTotal = options?.paymentIntentTotal
  const instructionCount =
    apiTotal != null && Number.isFinite(apiTotal) && apiTotal >= 0 ? apiTotal : null
  // Payment-intent `amount` is major — convert each row once, then sum integers.
  const summedAmountMinor = paymentIntents.reduce(
    (sum, item) => sum + majorAmountToMinor(item.amount),
    0,
  )
  const batchTotal = options?.batchTotalAmountMinor
  const intendedAmountMinor =
    batchTotal != null && Number.isFinite(batchTotal) && batchTotal >= 0
      ? Math.trunc(batchTotal)
      : summedAmountMinor

  const currency = normalizeJournalCurrency(
    options?.currency ??
      paymentIntents.map((item) => item.currency).find((c) => Boolean(c?.trim())) ??
      JOURNAL_DEFAULT_CURRENCY,
  )

  const readScore = (raw: unknown): number | null => {
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw
    if (typeof raw === 'string' && raw.trim()) {
      const n = Number.parseFloat(raw)
      return Number.isFinite(n) ? n : null
    }
    return null
  }

  const scores = paymentIntents
    .map((item) => readIntentQualityScore(item))
    .filter((s): s is number => s != null)
  const avgReadinessPct =
    scores.length > 0
      ? scores.reduce((a, b) => a + normalizeQualityPct(b), 0) / scores.length
      : null

  const batchAggregateConfidenceScore =
    paymentIntents.map((item) => readScore(item.aggregate_confidence_score)).find((s) => s != null) ?? null

  // Quality KPI — unique intents below threshold; never merged into review queue size (CON-P1-23).
  const lowReadinessIds = paymentIntents
    .map((item, index) => {
      const score = readIntentQualityScore(item)
      if (score == null) return null
      if (normalizeQualityPct(score) >= READINESS_REVIEW_THRESHOLD * 100) return null
      return paymentIntentIdentity(item, index)
    })
    .filter((id): id is string => id != null)
  const lowReadinessCount = uniqueCount(lowReadinessIds)

  const dlqCount = uniqueCount(dlqItems.map(dlqIdentity))

  const manualReviewIds = dlqItems
    .filter((item) => String(item.dlq_status ?? '').trim() === DLQ_STATUS_MANUAL_REVIEW)
    .map(dlqIdentity)
  const manualFromRows = uniqueCount(manualReviewIds)

  const processingFailedIds = dlqItems
    .filter((item) => String(item.dlq_status ?? '').trim() !== DLQ_STATUS_MANUAL_REVIEW)
    .map(dlqIdentity)
  const processingFailedCount = uniqueCount(processingFailedIds)

  const apiManual = options?.manualReviewApiTotal
  const hasApiManual = apiManual != null && Number.isFinite(apiManual) && apiManual >= 0
  const manualReviewCount = hasApiManual ? Math.floor(apiManual as number) : manualFromRows
  const needsReviewCount = manualReviewCount
  const needsReviewSource = hasApiManual
    ? ('dlq.manual-review.pagination.total' as const)
    : ('dlq.NEEDS_MANUAL_REVIEW.unique' as const)

  return {
    instructionCount,
    intendedAmountMinor,
    currency,
    avgReadinessPct,
    batchAggregateConfidenceScore,
    lowReadinessCount,
    dlqCount,
    manualReviewCount,
    needsReviewCount,
    processingFailedCount,
    needsReviewSource,
  }
}

export type IntentBatchHealthStatus = 'Ready' | 'Needs Review' | 'Awaiting Confirmation' | 'Failed Validation'

export function deriveIntentBatchHealth(metrics: IntentBatchMetrics): {
  status: IntentBatchHealthStatus
  reasons: string[]
} {
  const reasons: string[] = []
  if (metrics.processingFailedCount > 0) {
    reasons.push(
      `${metrics.processingFailedCount} processing-failed item${metrics.processingFailedCount === 1 ? '' : 's'} in DLQ`,
    )
  }
  if (metrics.needsReviewCount > 0) {
    reasons.push(
      `${metrics.needsReviewCount} item${metrics.needsReviewCount === 1 ? '' : 's'} in manual-review queue`,
    )
  }
  if (metrics.lowReadinessCount > 0) {
    reasons.push(
      `${metrics.lowReadinessCount} instruction${metrics.lowReadinessCount === 1 ? '' : 's'} below quality threshold (quality KPI only)`,
    )
  }

  // CON-P1-23: manual-review DLQ ⇒ Needs Review, not Failed Validation.
  if (metrics.processingFailedCount > 0) {
    return { status: 'Failed Validation', reasons }
  }
  if (metrics.needsReviewCount > 0) {
    return { status: 'Needs Review', reasons }
  }
  if ((metrics.instructionCount ?? 0) > 0 && metrics.dlqCount === 0) {
    // Low quality alone does not block Ready for governance queue status.
    return {
      status: 'Ready',
      reasons:
        metrics.lowReadinessCount > 0
          ? reasons
          : ['All instructions passed validation'],
    }
  }
  if ((metrics.instructionCount ?? 0) > 0) {
    return { status: 'Awaiting Confirmation', reasons: ['Payment instructions received — awaiting bank confirmation'] }
  }
  return { status: 'Ready', reasons: [] }
}
