import { coerceMinor } from '@/features/payout-command/leakage-portfolio/utils/formatMinorInr'
import type { BatchSummary } from '@/services/payout-command/batch-model'
import type {
  AmbiguityKpiResponse,
  BatchDetailResponse,
  DefensibilityKpiResponse,
  LeakageKpiResponse,
  PatternsKpiResponse,
} from '@/services/payout-command/prod-api/intelligenceTypes'
import { isDataAvailable } from '@/services/payout-command/prod-api/intelligenceTypes'
import { BATCH_REVIEW_COPY } from '../copy/batchCommandCenterCopy'
import {
  formatBatchCountPair,
  formatBatchMetricPercent,
  formatConfidencePct,
  formatMinorDisplay,
} from './formatBatchMetrics'

export type BatchKpiCardModel = {
  id: string
  title: string
  value: string
  subtitle: string
  empty?: boolean
  actionLabel?: string
  actionHref?: string
}

export type BatchHealthState = 'clean' | 'waiting' | 'review'

export function resolveBatchHealthState(args: {
  intentIngestOk: boolean
  settlementIngestOk: boolean
  failureCount: number
  needsReviewCount: number
  pendingCount: number
}): BatchHealthState {
  if (args.failureCount > 0 || args.needsReviewCount > 0) return 'review'
  if (args.intentIngestOk && !args.settlementIngestOk && args.pendingCount > 0) return 'waiting'
  if (args.intentIngestOk && !args.settlementIngestOk) return 'waiting'
  return 'clean'
}

export function mapBatchReviewKpis(args: {
  summary: BatchSummary
  intelBatchDetail: BatchDetailResponse | null
  leakageKpi: LeakageKpiResponse | null
  ambiguityKpi: AmbiguityKpiResponse | null
  defensibilityKpi: DefensibilityKpiResponse | null
  patternsKpi: PatternsKpiResponse | null
  engineIntentCount: number
  engineFailureCount: number
}): BatchKpiCardModel[] {
  const { summary } = args
  const health = args.intelBatchDetail?.batch_health
  const total =
    health?.total_count != null
      ? Number(health.total_count)
      : Math.max(summary.totalRows, args.engineIntentCount + args.engineFailureCount)
  const processed = summary.processed
  const failed = Math.max(summary.failed, args.engineFailureCount)
  const pending = summary.pending

  const intendedMinor = health ? coerceMinor(health.total_intended_amount_minor) : null
  const confirmedMinor = health
    ? coerceMinor(health.total_confirmed_amount_minor)
    : args.leakageKpi && isDataAvailable(args.leakageKpi)
      ? coerceMinor(args.leakageKpi.total_observed_settled_amount_minor)
      : null

  const valueNeedingReviewMinor =
    args.leakageKpi && isDataAvailable(args.leakageKpi)
      ? coerceMinor(args.leakageKpi.unmatched_amount_minor)
      : null

  const processedPct = formatBatchMetricPercent(processed, total)
  const cards: BatchKpiCardModel[] = [
    {
      id: 'records-processed',
      title: BATCH_REVIEW_COPY.kpis.recordsProcessed.title,
      value: total > 0 ? formatBatchCountPair(processed, total) : BATCH_REVIEW_COPY.kpis.recordsProcessed.empty,
      subtitle:
        total > 0
          ? BATCH_REVIEW_COPY.kpis.recordsProcessed.subtitle
          : BATCH_REVIEW_COPY.kpis.recordsProcessed.emptyHelper,
      empty: total <= 0,
    },
    {
      id: 'intended-value',
      title: BATCH_REVIEW_COPY.kpis.intendedValue.title,
      value: formatMinorDisplay(intendedMinor),
      subtitle: total > 0 ? 'Total value from payment instructions' : BATCH_REVIEW_COPY.kpis.uploadToCalculate,
      empty: !intendedMinor,
    },
    {
      id: 'bank-confirmed',
      title: BATCH_REVIEW_COPY.kpis.bankConfirmed.title,
      value:
        confirmedMinor != null && confirmedMinor > 0
          ? formatMinorDisplay(confirmedMinor)
          : BATCH_REVIEW_COPY.kpis.bankConfirmed.empty,
      subtitle:
        confirmedMinor != null && confirmedMinor > 0
          ? BATCH_REVIEW_COPY.kpis.bankConfirmed.subtitle
          : BATCH_REVIEW_COPY.kpis.bankConfirmed.emptyHelper,
      empty: !confirmedMinor,
    },
    {
      id: 'pending',
      title: BATCH_REVIEW_COPY.kpis.pending.title,
      value: pending > 0 ? `${pending.toLocaleString('en-IN')} payments` : BATCH_REVIEW_COPY.kpis.noData,
      subtitle: BATCH_REVIEW_COPY.kpis.pending.subtitle,
      empty: pending <= 0 && total <= 0,
      actionLabel: BATCH_REVIEW_COPY.kpis.pending.uploadCta,
      actionHref: '#batch-intake-step-2',
    },
    {
      id: 'needs-review',
      title: BATCH_REVIEW_COPY.kpis.needsReview.title,
      value: failed > 0 ? `${failed.toLocaleString('en-IN')} payments` : processedPct.isEmpty ? BATCH_REVIEW_COPY.kpis.noData : '0 payments',
      subtitle: BATCH_REVIEW_COPY.kpis.needsReview.subtitle,
      empty: failed <= 0 && total <= 0,
      actionLabel: BATCH_REVIEW_COPY.kpis.needsReview.viewCta,
      actionHref: '#batch-review-items',
    },
    {
      id: 'value-needing-review',
      title: BATCH_REVIEW_COPY.kpis.valueNeedingReview.title,
      value: formatMinorDisplay(valueNeedingReviewMinor),
      subtitle: 'Unmatched payment value from leakage dashboard',
      empty: valueNeedingReviewMinor == null,
    },
  ]

  if (args.ambiguityKpi && isDataAvailable(args.ambiguityKpi)) {
    cards.push({
      id: 'match-confidence',
      title: BATCH_REVIEW_COPY.kpis.matchConfidence.title,
      value: formatConfidencePct(args.ambiguityKpi.avg_attachment_confidence),
      subtitle: 'Average attachment confidence for this batch window',
      empty: false,
    })
    if (args.ambiguityKpi.carrier_completeness_rate != null) {
      cards.push({
        id: 'reference-completeness',
        title: BATCH_REVIEW_COPY.kpis.referenceCompleteness.title,
        value: formatConfidencePct(args.ambiguityKpi.carrier_completeness_rate),
        subtitle: 'Share of payments with complete reference carriers',
        empty: false,
      })
    }
    cards.push({
      id: 'missing-reference',
      title: BATCH_REVIEW_COPY.kpis.missingReferenceRate.title,
      value: formatConfidencePct(args.ambiguityKpi.provider_ref_missing_rate),
      subtitle: 'Payments missing provider reference',
      empty: false,
    })
  }

  if (args.patternsKpi && isDataAvailable(args.patternsKpi) && args.patternsKpi.value_date_mismatch_count != null) {
    cards.push({
      id: 'value-date-mismatch',
      title: BATCH_REVIEW_COPY.kpis.valueDateMismatch.title,
      value: String(args.patternsKpi.value_date_mismatch_count),
      subtitle: 'Payments with value-date mismatches',
      empty: false,
    })
  }

  if (args.defensibilityKpi && isDataAvailable(args.defensibilityKpi)) {
    cards.push({
      id: 'evidence-coverage',
      title: BATCH_REVIEW_COPY.kpis.evidenceCoverage.title,
      value: formatConfidencePct(args.defensibilityKpi.evidence_pack_rate),
      subtitle: 'Share of payments with evidence pack coverage',
      empty: false,
    })
  }

  return cards
}

export type PaymentStatusSlice = { name: string; value: number }

export function mapPaymentStatusBreakdown(summary: BatchSummary): PaymentStatusSlice[] {
  const total = Math.max(summary.totalRows, 1)
  return [
    { name: BATCH_REVIEW_COPY.chart.confirmed, value: (summary.success / total) * 100 },
    { name: BATCH_REVIEW_COPY.chart.pending, value: (summary.pending / total) * 100 },
    { name: BATCH_REVIEW_COPY.chart.failed, value: (summary.failed / total) * 100 },
    { name: BATCH_REVIEW_COPY.chart.needsReview, value: (summary.failed / total) * 100 },
  ].filter((s) => s.value > 0.01)
}
