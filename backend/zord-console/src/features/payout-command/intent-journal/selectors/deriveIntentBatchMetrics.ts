import type { IntentJournalPaymentIntentItem, IntentJournalDlqItem } from '@/services/payout-command/prod-api/intentJournalTypes'
import { readIntentQualityScore } from '@/services/payout-command/prod-api/resolveIntentQualityScore'
import { READINESS_REVIEW_THRESHOLD } from '../mappers/mapIntentTableRow'
import {
  JOURNAL_DEFAULT_CURRENCY,
  majorAmountToMinor,
  normalizeJournalCurrency,
} from '@/services/payout-command/prod-api/money/journalMoney'

export type IntentBatchMetrics = {
  /** Authoritative count from payment-intents `pagination.total`; null when API total missing. */
  instructionCount: number | null
  /** Batch total in minor units — from batch-ids (converted) or sum of payment-intent amounts. */
  intendedAmountMinor: number
  currency: string
  avgReadinessPct: number | null
  /** Batch aggregate from intent-engine `aggregate_confidence_score` (0ΓÇô1). */
  batchAggregateConfidenceScore: number | null
  lowReadinessCount: number
  dlqCount: number
  manualReviewCount: number
  needsReviewCount: number
}

export type DeriveIntentBatchMetricsOptions = {
  /** Authoritative batch intent count from payment-intents `pagination.total`. */
  paymentIntentTotal?: number | null
  /** Authoritative batch value already in minor units. */
  batchTotalAmountMinor?: number | null
  currency?: string | null
}

export function deriveIntentBatchMetrics(
  paymentIntents: IntentJournalPaymentIntentItem[],
  dlqItems: IntentJournalDlqItem[],
  options?: DeriveIntentBatchMetricsOptions,
): IntentBatchMetrics {
  const apiTotal = options?.paymentIntentTotal
  const instructionCount =
    apiTotal != null && Number.isFinite(apiTotal) && apiTotal >= 0 ? apiTotal : null
  // Payment-intent `amount` is major INR — convert each row once, then sum integers.
  const summedAmountMinor = paymentIntents.reduce(
    (sum, item) => sum + majorAmountToMinor(item.amount),
    0,
  )
  const batchTotal = options?.batchTotalAmountMinor
  const intendedAmountMinor =
    batchTotal != null && Number.isFinite(batchTotal) && batchTotal >= 0
      ? Math.trunc(batchTotal)
      : summedAmountMinor

  const currency =
    normalizeJournalCurrency(
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

  const normalizeQualityPct = (score: number): number => (score <= 1 ? score * 100 : score)

  const scores = paymentIntents
    .map((item) => readIntentQualityScore(item))
    .filter((s): s is number => s != null)
  const avgReadinessPct =
    scores.length > 0
      ? scores.reduce((a, b) => a + normalizeQualityPct(b), 0) / scores.length
      : null

  const batchAggregateConfidenceScore =
    paymentIntents.map((item) => readScore(item.aggregate_confidence_score)).find((s) => s != null) ?? null

  const lowReadinessCount = paymentIntents.filter((item) => {
    const score = readIntentQualityScore(item)
    if (score == null) return false
    return normalizeQualityPct(score) < READINESS_REVIEW_THRESHOLD * 100
  }).length
  const governedHoldCount = paymentIntents.filter((item) => {
    const gov = String(item.governance_state ?? '').trim().toUpperCase()
    const lifecycle = String(item.intent_lifecycle_state ?? '').trim().toUpperCase()
    return gov === 'REQUIRES_REVIEW' || gov === 'FLAGGED' || lifecycle === 'FLAGGED_FOR_REVIEW'
  }).length
  const dlqCount = dlqItems.length
  const manualReviewCount = dlqItems.filter(
    (item) => String(item.dlq_status ?? '').trim() === 'NEEDS_MANUAL_REVIEW',
  ).length
  const needsReviewCount = dlqCount + lowReadinessCount + governedHoldCount

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
  }
}

export type IntentBatchHealthStatus = 'Ready' | 'Needs Review' | 'Awaiting Confirmation' | 'Failed Validation'

export function deriveIntentBatchHealth(metrics: IntentBatchMetrics): {
  status: IntentBatchHealthStatus
  reasons: string[]
} {
  const reasons: string[] = []
  if (metrics.dlqCount > 0) {
    reasons.push(`${metrics.dlqCount} review item${metrics.dlqCount === 1 ? '' : 's'} in DLQ`)
  }
  if (metrics.lowReadinessCount > 0) {
    reasons.push(`${metrics.lowReadinessCount} instruction${metrics.lowReadinessCount === 1 ? '' : 's'} below readiness threshold`)
  }

  if (metrics.dlqCount > 0) {
    return { status: 'Failed Validation', reasons }
  }
  if (metrics.needsReviewCount > 0) {
    return { status: 'Needs Review', reasons }
  }
  if ((metrics.instructionCount ?? 0) > 0 && metrics.dlqCount === 0 && metrics.lowReadinessCount === 0) {
    return { status: 'Ready', reasons: ['All instructions passed validation'] }
  }
  if ((metrics.instructionCount ?? 0) > 0) {
    return { status: 'Awaiting Confirmation', reasons: ['Payment instructions received — awaiting bank confirmation'] }
  }
  return { status: 'Ready', reasons: [] }
}

