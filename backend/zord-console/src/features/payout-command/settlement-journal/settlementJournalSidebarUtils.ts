import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'
import {
  DEFAULT_TENANT_BUSINESS_TIMEZONE,
  isInstantInBusinessDatePreset,
} from '@/services/payout-command/tenantBusinessTimezone'
import {
  CURRENCY_NEUTRAL_AMOUNT_RANGES,
  aggregateMoney,
  formatMoneyBuckets,
  groupAmountsByCurrency,
  matchesCurrencyAwareAmountRange,
  type CurrencyNeutralAmountRange,
} from '@/services/payout-command/money/money'
import {
  isFailedObservationStatus,
  isSettledObservationStatus,
  mapSettlementObservationStatus,
} from './settlementObservationStatusMap'

export {
  isFailedObservationStatus,
  isSettledObservationStatus,
  mapSettlementObservationStatus,
  settlementStatusDisplayLabel,
} from './settlementObservationStatusMap'

export type DateRangePreset = 'all' | '7d' | '30d' | '90d' | 'ytd'

/** Sidebar / hero settlement outcome — never derived from attachment confidence. */
export type SettlementSidebarOutcomeLabel =
  | 'Fully Settled'
  | 'Partially Reconciled'
  | 'Open'
  | 'Failed'
  | 'Requires Review'
  | 'Cancelled'
  | 'Processing'
  | 'Unknown'

export type SettlementSidebarOutcome = {
  total: number
  settled: number
  failed: number
  settledPct: number | null
  label: SettlementSidebarOutcomeLabel
  /** Raw Service 5 finality when known (e.g. FULLY_SETTLED). */
  finalityStatus: string | null
  dotClass: string
  /** Value/count coverage progress (0–100), not attachment confidence. */
  progressPct: number
  toneText: string
  barClass: string
}

export type SettlementFinalityCoverageInput = {
  finalityStatus?: string | null
  totalIntendedMinor?: number | null
  unresolvedIntendedMinor?: number | null
  totalConfirmedMinor?: number | null
  totalCount?: number | null
  unresolvedCount?: number | null
  successCount?: number | null
  failedCount?: number | null
  pendingCount?: number | null
}

export const DATE_RANGE_OPTIONS: { value: DateRangePreset; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'ytd', label: 'Year to date' },
]

/** Currency-neutral amount ranges (CON-P0-23 — no ₹ / INR assumption). */
export const AMOUNT_RANGE_OPTIONS = CURRENCY_NEUTRAL_AMOUNT_RANGES

export type AmountRangeFilter = CurrencyNeutralAmountRange

/** Material unresolved value (≥1%) blocks Fully Settled even if finality looks closed. */
export const MATERIAL_UNRESOLVED_VALUE_RATIO = 0.01

/**
 * Coverage bands aligned with Intent Journal aggregate thresholds
 * (Critical <50 · At Risk 50–75 · Stable ≥75).
 * High coverage must not surface as customer “Requires Review”.
 */
export const SETTLEMENT_COVERAGE_STATUS_THRESHOLDS = {
  /** Below this → keep Requires Review when Service 5 says REQUIRES_REVIEW. */
  requiresReviewBelowPct: 75,
  /** At/above this with complete coverage → Fully Settled. */
  fullySettledFromPct: 100,
} as const

/**
 * Financial day filter in the tenant business timezone (CON-P1-29).
 * Prefer ISO `observationAt` when present — display strings are for UI only.
 */
export function observationInDateRange(
  observationTime: string,
  preset: DateRangePreset,
  timeZone: string = DEFAULT_TENANT_BUSINESS_TIMEZONE,
  observationAtIso?: string | null,
): boolean {
  const instant = observationAtIso?.trim() || observationTime
  return isInstantInBusinessDatePreset(instant, preset, timeZone)
}

/** @deprecated Prefer matchesAmountRangeForRow — amount alone is not currency-safe. */
export function matchesAmountRange(amount: number, range: AmountRangeFilter): boolean {
  return matchesCurrencyAwareAmountRange(amount, 'UNKNOWN', range === 'All' ? 'All' : range)
}

export function matchesAmountRangeForRow(
  amount: number,
  currency: string | null | undefined,
  range: AmountRangeFilter,
): boolean {
  return matchesCurrencyAwareAmountRange(amount, currency, range)
}

function parseMinor(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null
  return value
}

/** Unresolved intended value ÷ total intended value (0–1), null when unknown. */
export function unresolvedValueRatio(input: SettlementFinalityCoverageInput): number | null {
  const intended = parseMinor(input.totalIntendedMinor)
  const unresolved = parseMinor(input.unresolvedIntendedMinor)
  if (intended == null || intended <= 0 || unresolved == null) return null
  return Math.min(1, Math.max(0, unresolved / intended))
}

/** Coverage progress from confirmed/intended or inverse of unresolved ratio. */
export function coverageProgressPct(input: SettlementFinalityCoverageInput): number {
  const intended = parseMinor(input.totalIntendedMinor)
  const confirmed = parseMinor(input.totalConfirmedMinor)
  if (intended != null && intended > 0 && confirmed != null) {
    return Math.round(Math.min(100, Math.max(0, (confirmed / intended) * 100)))
  }
  const unresolvedRatio = unresolvedValueRatio(input)
  if (unresolvedRatio != null) {
    return Math.round(Math.min(100, Math.max(0, (1 - unresolvedRatio) * 100)))
  }
  const total = input.totalCount
  const success = input.successCount
  if (total != null && total > 0 && success != null && Number.isFinite(success)) {
    return Math.round(Math.min(100, Math.max(0, (success / total) * 100)))
  }
  return 0
}

function toneForLabel(
  label: SettlementSidebarOutcomeLabel,
  progressPct = 0,
): Pick<SettlementSidebarOutcome, 'dotClass' | 'toneText' | 'barClass'> {
  if (label === 'Fully Settled') {
    return { dotClass: 'bg-emerald-500', toneText: 'text-emerald-700', barClass: 'bg-emerald-500' }
  }
  if (label === 'Failed' || label === 'Cancelled') {
    return { dotClass: 'bg-rose-500', toneText: 'text-rose-700', barClass: 'bg-rose-500' }
  }
  if (label === 'Requires Review') {
    return { dotClass: 'bg-rose-500', toneText: 'text-rose-700', barClass: 'bg-rose-500' }
  }
  if (label === 'Unknown' || label === 'Open' || label === 'Processing') {
    return { dotClass: 'bg-slate-400', toneText: 'text-slate-600', barClass: 'bg-slate-400' }
  }
  // Partially Reconciled — green when nearly complete (Intent Stable-like band)
  if (progressPct >= SETTLEMENT_COVERAGE_STATUS_THRESHOLDS.requiresReviewBelowPct) {
    return { dotClass: 'bg-emerald-500', toneText: 'text-emerald-700', barClass: 'bg-emerald-500' }
  }
  return { dotClass: 'bg-amber-500', toneText: 'text-amber-700', barClass: 'bg-amber-500' }
}

function emptyOutcome(label: SettlementSidebarOutcomeLabel = 'Open'): SettlementSidebarOutcome {
  const tone = toneForLabel(label)
  return {
    total: 0,
    settled: 0,
    failed: 0,
    settledPct: null,
    label,
    finalityStatus: null,
    progressPct: 0,
    ...tone,
  }
}

/**
 * CON-P0-13 — sidebar/hero outcome from Service 5 finality + count/value coverage.
 * Attachment / match confidence must never map to Settled/Failed.
 */
export function outcomeFromFinalityAndCoverage(
  input: SettlementFinalityCoverageInput | null | undefined,
): SettlementSidebarOutcome {
  if (!input) return emptyOutcome('Open')

  const finalityRaw = String(input.finalityStatus ?? '').trim()
  const finality = finalityRaw.toUpperCase()
  const unresolvedRatio = unresolvedValueRatio(input)
  const hasMaterialUnresolvedValue =
    unresolvedRatio != null && unresolvedRatio >= MATERIAL_UNRESOLVED_VALUE_RATIO
  const progressPct = coverageProgressPct(input)
  const total = input.totalCount != null && Number.isFinite(input.totalCount) ? input.totalCount : 0
  const settled =
    input.successCount != null && Number.isFinite(input.successCount) ? input.successCount : 0
  const failed =
    input.failedCount != null && Number.isFinite(input.failedCount) ? input.failedCount : 0
  const unresolvedCount =
    input.unresolvedCount != null && Number.isFinite(input.unresolvedCount)
      ? input.unresolvedCount
      : null
  const hasUnresolvedCounts =
    (unresolvedCount != null && unresolvedCount > 0) ||
    (input.pendingCount != null && input.pendingCount > 0)

  let label: SettlementSidebarOutcomeLabel = 'Open'

  if (finality === 'FAILED') {
    label = 'Failed'
  } else if (finality === 'CANCELLED') {
    label = 'Cancelled'
  } else if (finality === 'REQUIRES_REVIEW') {
    // Same idea as Intent sidebar: label follows coverage health, not raw finality alone.
    // ≥75% coverage (Intent “Stable” band) must not stay “Requires Review”.
    if (
      progressPct >= SETTLEMENT_COVERAGE_STATUS_THRESHOLDS.fullySettledFromPct &&
      !hasMaterialUnresolvedValue &&
      !hasUnresolvedCounts &&
      failed === 0 &&
      (settled > 0 || progressPct >= 100)
    ) {
      label = 'Fully Settled'
    } else if (progressPct >= SETTLEMENT_COVERAGE_STATUS_THRESHOLDS.requiresReviewBelowPct) {
      label = 'Partially Reconciled'
    } else if (progressPct > 0 || settled > 0) {
      label = 'Requires Review'
    } else {
      label = 'Requires Review'
    }
  } else if (finality === 'FULLY_SETTLED' || finality === 'SETTLED') {
    // Coverage can keep an "open" commercial picture even when confidence is high.
    label = hasMaterialUnresolvedValue || hasUnresolvedCounts ? 'Partially Reconciled' : 'Fully Settled'
  } else if (finality === 'PARTIALLY_SETTLED') {
    label = 'Partially Reconciled'
  } else if (finality === 'PROCESSING') {
    label = hasMaterialUnresolvedValue || progressPct > 0 ? 'Partially Reconciled' : 'Processing'
  } else if (finality === 'OPEN' || finality === 'PENDING' || !finality) {
    if (hasMaterialUnresolvedValue || hasUnresolvedCounts) {
      label = progressPct > 0 || settled > 0 ? 'Partially Reconciled' : 'Open'
    } else if (progressPct >= 100 && settled > 0 && failed === 0) {
      label = 'Fully Settled'
    } else if (progressPct > 0 || settled > 0) {
      label = 'Partially Reconciled'
    } else {
      label = 'Open'
    }
  } else {
    label = hasMaterialUnresolvedValue || progressPct > 0 ? 'Partially Reconciled' : 'Open'
  }

  const tone = toneForLabel(label, progressPct)
  return {
    total,
    settled,
    failed,
    settledPct: progressPct > 0 ? progressPct : null,
    label,
    finalityStatus: finalityRaw || null,
    progressPct,
    ...tone,
  }
}

/**
 * @deprecated CON-P0-13 — confidence is not finality. Kept only so accidental callers
 * cannot silently get Settled/Failed from match score; always returns Open-neutral shell.
 */
export function outcomeFromMatchConfidence(
  _matchConfidence: number | null | undefined,
): SettlementSidebarOutcome {
  return emptyOutcome('Open')
}

/** Format attachment/match confidence for separate display (never as Settled/Failed). */
export function formatAttachmentConfidencePct(
  matchConfidence: number | null | undefined,
): string | null {
  if (matchConfidence == null || !Number.isFinite(matchConfidence)) return null
  const score = matchConfidence <= 1 ? matchConfidence : matchConfidence / 100
  const pct = Math.round(Math.min(100, Math.max(0, score * 100)))
  return `${pct}%`
}

export function outcomeFromObservationRows(rows: SettlementObservationTableRow[]): SettlementSidebarOutcome {
  const total = rows.length
  if (total === 0) {
    return emptyOutcome('Open')
  }
  const settled = rows.filter((r) => isSettledObservationStatus(r.statusRaw)).length
  const failed = rows.filter((r) => isFailedObservationStatus(r.statusRaw)).length
  const known = rows.filter((r) => mapSettlementObservationStatus(r.statusRaw).known).length
  const settledPct = Math.round((settled / total) * 100)
  let label: SettlementSidebarOutcomeLabel = 'Partially Reconciled'
  // CON-P1-24: unknown statuses never upgrade the batch to Fully Settled / Settled.
  if (known === 0) label = 'Unknown'
  else if (failed > 0 && failed >= settled) label = 'Failed'
  else if (settled === total) label = 'Fully Settled'
  else if (settled === 0 && failed === 0) label = 'Open'

  const tone = toneForLabel(label, settledPct)
  return {
    total,
    settled,
    failed,
    settledPct,
    label,
    finalityStatus: null,
    progressPct: settledPct,
    ...tone,
  }
}

export function settlementStatusBadgeClass(statusRaw: string) {
  const { bucket } = mapSettlementObservationStatus(statusRaw)
  if (bucket === 'settled') {
    return 'inline-flex rounded-full border border-black/30 bg-black px-2.5 py-0.5 text-[12px] font-semibold text-white'
  }
  if (bucket === 'failed') {
    return 'inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[12px] font-semibold text-rose-800'
  }
  if (bucket === 'pending') {
    return 'inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[12px] font-semibold text-amber-900'
  }
  // unknown / Needs mapping — never styled as settled success
  return 'inline-flex rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-[12px] font-semibold text-slate-700'
}

export function computeSettlementBatchSummary(rows: SettlementObservationTableRow[]) {
  const amountAgg = aggregateMoney(rows.map((r) => ({ amount: r.amount, currency: r.currency })))
  const settledAgg = aggregateMoney(rows.map((r) => ({ amount: r.settledAmount, currency: r.currency })))
  const feesAgg = aggregateMoney(rows.map((r) => ({ amount: r.feeAmount, currency: r.currency })))
  const outcome = outcomeFromObservationRows(rows)
  return {
    /** Null when mixed/UNKNOWN currencies block a single portfolio total (CON-P0-23). */
    totalAmount: amountAgg.ok ? amountAgg.total.amount : null,
    totalSettled: settledAgg.ok ? settledAgg.total.amount : null,
    totalFees: feesAgg.ok ? feesAgg.total.amount : null,
    totalAmountDisplay: formatMoneyBuckets(groupAmountsByCurrency(rows.map((r) => ({ amount: r.amount, currency: r.currency })))),
    totalSettledDisplay: formatMoneyBuckets(
      groupAmountsByCurrency(rows.map((r) => ({ amount: r.settledAmount, currency: r.currency }))),
    ),
    totalFeesDisplay: formatMoneyBuckets(groupAmountsByCurrency(rows.map((r) => ({ amount: r.feeAmount, currency: r.currency })))),
    currency: amountAgg.ok ? amountAgg.total.currency : null,
    outcome,
  }
}

/** Build finality/coverage input from Intelligence batch detail payloads. */
export function finalityCoverageFromBatchDetail(detail: {
  batch?: {
    finality_status?: string | null
    batch_finality_status?: string | null
    total_intended_amount_minor?: number | string | null
    unresolved_intended_amount_minor?: number | string | null
    total_confirmed_amount_minor?: number | string | null
    total_count?: number | null
    unresolved_count?: number | null
    success_count?: number | null
    failed_count?: number | null
    pending_count?: number | null
  } | null
  batch_health?: {
    finality_status?: string | null
    total_intended_amount_minor?: number | string | null
    total_confirmed_amount_minor?: number | string | null
    unresolved_count?: number | null
    total_count?: number | null
    success_count?: number | null
    failed_count?: number | null
    pending_count?: number | null
  } | null
} | null | undefined): SettlementFinalityCoverageInput {
  const batch = detail?.batch
  const health = detail?.batch_health
  const toNum = (v: number | string | null | undefined): number | null => {
    if (v == null || v === '') return null
    const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }
  return {
    finalityStatus: batch?.finality_status ?? batch?.batch_finality_status ?? health?.finality_status ?? null,
    totalIntendedMinor:
      toNum(batch?.total_intended_amount_minor) ?? toNum(health?.total_intended_amount_minor),
    unresolvedIntendedMinor: toNum(batch?.unresolved_intended_amount_minor),
    totalConfirmedMinor:
      toNum(batch?.total_confirmed_amount_minor) ?? toNum(health?.total_confirmed_amount_minor),
    totalCount: batch?.total_count ?? health?.total_count ?? null,
    unresolvedCount: batch?.unresolved_count ?? health?.unresolved_count ?? null,
    successCount: batch?.success_count ?? health?.success_count ?? null,
    failedCount: batch?.failed_count ?? health?.failed_count ?? null,
    pendingCount: batch?.pending_count ?? health?.pending_count ?? null,
  }
}
