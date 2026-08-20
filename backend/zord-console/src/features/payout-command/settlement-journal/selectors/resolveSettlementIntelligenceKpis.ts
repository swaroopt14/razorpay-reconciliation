import type { BatchContractKpiResponse, BatchDetailResponse } from '@/services/payout-command/prod-api/intelligenceTypes'

/**
 * CON-P0-24 / CON-P1-22 — live settlement KPIs:
 * - One authoritative field per KPI (no non-equivalent stand-ins).
 * - Each KPI exposes source + as-of provenance.
 * - Missing authoritative field ⇒ null → UI shows Unavailable.
 */

function parseApiAmount(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export function parsePercentValue(value: unknown): string | null {
  if (value == null || value === '') return null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${(value * 100).toFixed(2)}%`
  }
  return null
}

export function parseMatchConfidence(value: unknown): number | null {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value <= 1 ? value : value / 100
  }
  return null
}

/** Display when an authoritative live KPI field is absent. */
export const LIVE_KPI_UNAVAILABLE = 'Unavailable'

/** Authoritative field names for settlement intelligence KPIs (live surfaces). */
export const SETTLEMENT_LIVE_KPI_FIELDS = {
  settlementValueMatched: 'confirmed_matched_value_minor',
  varianceAmount: 'variance_amount',
  unmatchedSettlementValue: 'unmatch_amount',
  matchConfidence: 'match_confidence',
  missingReferenceRate: 'missing_reference_rate',
  bankReferenceCoverage: 'bank_reference_coverage',
  clientReferenceCoverage: 'client_reference_coverage',
  observedSettlementValue: 'original_settled_amount',
} as const

export const SETTLEMENT_LIVE_KPI_ENDPOINT = 'batch_contract' as const

export type LiveKpiProvenance = {
  /** Endpoint / projection that owns the field. */
  endpoint: typeof SETTLEMENT_LIVE_KPI_ENDPOINT
  /** Authoritative field name (never a stand-in). */
  field: string
  /** ISO timestamp when known. */
  asOf: string | null
  /** Which timestamp field supplied asOf (honest provenance). */
  asOfField: 'computed_at' | 'batch_health.updated_at' | null
}

export type ResolvedSettlementIntelligenceKpis = {
  settlementValueMatched: number | null
  varianceAmount: number | null
  unmatchedSettlementValue: number | null
  matchConfidence: number | null
  missingReferenceRate: string | null
  bankReferenceCoverage: string | null
  clientReferenceCoverage: string | null
  /** Observed settlement hero value — authoritative field only. */
  observedSettlementValue: number | null
  /** True when settlementValueMatched used only a non-authoritative stand-in (always false after CON-P0-24). */
  settlementValueMatchedIsStandIn: false
  /** Shared as-of for this resolution pass. */
  asOf: string | null
  asOfField: LiveKpiProvenance['asOfField']
  /** Per-KPI source contract (field path). */
  sources: {
    settlementValueMatched: string
    varianceAmount: string
    unmatchedSettlementValue: string
    matchConfidence: string
    missingReferenceRate: string
    bankReferenceCoverage: string
    clientReferenceCoverage: string
    observedSettlementValue: string
  }
}

function resolveAsOf(
  batchContract: BatchContractKpiResponse | null,
  batchDetail: BatchDetailResponse | null,
): Pick<ResolvedSettlementIntelligenceKpis, 'asOf' | 'asOfField'> {
  const computedAt = typeof batchContract?.computed_at === 'string' ? batchContract.computed_at.trim() : ''
  if (computedAt) return { asOf: computedAt, asOfField: 'computed_at' }
  const updatedAt =
    typeof batchDetail?.batch_health?.updated_at === 'string'
      ? batchDetail.batch_health.updated_at.trim()
      : ''
  if (updatedAt) return { asOf: updatedAt, asOfField: 'batch_health.updated_at' }
  return { asOf: null, asOfField: null }
}

function fieldPath(field: string): string {
  return `${SETTLEMENT_LIVE_KPI_ENDPOINT}.${field}`
}

/**
 * Authoritative reader for matched settlement value.
 * Only `confirmed_matched_value_minor` — never `total_confirmed_amount`.
 */
export function confirmedMatchedValueMinorFromBatchContract(
  batchContract: BatchContractKpiResponse | null | undefined,
): number | null {
  return parseApiAmount(batchContract?.confirmed_matched_value_minor)
}

/**
 * Reject non-equivalent stand-ins for matched value.
 * Returns null when only total_confirmed* (or other substitutes) are present.
 */
export function resolveAuthoritativeMatchedValue(batchContract: BatchContractKpiResponse | null | undefined): {
  value: number | null
  usedStandIn: boolean
} {
  const authoritative = parseApiAmount(batchContract?.confirmed_matched_value_minor)
  if (authoritative != null) {
    return { value: authoritative, usedStandIn: false }
  }
  const standInCandidates = [batchContract?.total_confirmed_amount]
  const hasStandInOnly = standInCandidates.some((v) => parseApiAmount(v) != null)
  return { value: null, usedStandIn: hasStandInOnly }
}

export function resolveSettlementIntelligenceKpis(
  batchContract: BatchContractKpiResponse | null,
  batchDetail: BatchDetailResponse | null,
): ResolvedSettlementIntelligenceKpis {
  // batchDetail may supply as-of via batch_health.updated_at only — never metric stand-ins.
  const matched = resolveAuthoritativeMatchedValue(batchContract)
  const { asOf, asOfField } = resolveAsOf(batchContract, batchDetail)

  return {
    settlementValueMatched: matched.value,
    varianceAmount: parseApiAmount(batchContract?.variance_amount),
    unmatchedSettlementValue: parseApiAmount(batchContract?.unmatch_amount),
    matchConfidence: parseMatchConfidence(batchContract?.match_confidence),
    missingReferenceRate: parsePercentValue(batchContract?.missing_reference_rate),
    bankReferenceCoverage: batchContract?.bank_reference_coverage ?? null,
    clientReferenceCoverage: batchContract?.client_reference_coverage ?? null,
    observedSettlementValue: parseApiAmount(batchContract?.original_settled_amount),
    settlementValueMatchedIsStandIn: false,
    asOf,
    asOfField,
    sources: {
      settlementValueMatched: fieldPath(SETTLEMENT_LIVE_KPI_FIELDS.settlementValueMatched),
      varianceAmount: fieldPath(SETTLEMENT_LIVE_KPI_FIELDS.varianceAmount),
      unmatchedSettlementValue: fieldPath(SETTLEMENT_LIVE_KPI_FIELDS.unmatchedSettlementValue),
      matchConfidence: fieldPath(SETTLEMENT_LIVE_KPI_FIELDS.matchConfidence),
      missingReferenceRate: fieldPath(SETTLEMENT_LIVE_KPI_FIELDS.missingReferenceRate),
      bankReferenceCoverage: fieldPath(SETTLEMENT_LIVE_KPI_FIELDS.bankReferenceCoverage),
      clientReferenceCoverage: fieldPath(SETTLEMENT_LIVE_KPI_FIELDS.clientReferenceCoverage),
      observedSettlementValue: fieldPath(SETTLEMENT_LIVE_KPI_FIELDS.observedSettlementValue),
    },
  }
}
