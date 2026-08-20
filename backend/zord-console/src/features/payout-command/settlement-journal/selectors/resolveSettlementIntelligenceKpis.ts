import type { BatchContractKpiResponse, BatchDetailResponse } from '@/services/payout-command/prod-api/intelligenceTypes'

/**
 * CON-P0-24 — live customer-facing settlement KPIs use one authoritative field each.
 * Non-equivalent stand-ins (e.g. total_confirmed_amount for confirmed_matched_value_minor) are forbidden.
 * Missing authoritative field ⇒ null → UI shows Unavailable / —.
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
} as const

export type ResolvedSettlementIntelligenceKpis = {
  settlementValueMatched: number | null
  varianceAmount: number | null
  unmatchedSettlementValue: number | null
  matchConfidence: number | null
  missingReferenceRate: string | null
  bankReferenceCoverage: string | null
  clientReferenceCoverage: string | null
  /** True when settlementValueMatched used only a non-authoritative stand-in (always false after CON-P0-24). */
  settlementValueMatchedIsStandIn: false
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
  // Explicitly ignore non-equivalent fields that older code treated as stand-ins.
  const standInCandidates = [
    batchContract?.total_confirmed_amount,
  ]
  const hasStandInOnly = standInCandidates.some((v) => parseApiAmount(v) != null)
  return { value: null, usedStandIn: hasStandInOnly }
}

export function resolveSettlementIntelligenceKpis(
  batchContract: BatchContractKpiResponse | null,
  _batchDetail: BatchDetailResponse | null,
): ResolvedSettlementIntelligenceKpis {
  // batchDetail retained for call-site compatibility; live matched-value KPI must not
  // fall back to total_confirmed_amount_minor on batch/health (different measure).
  void _batchDetail

  const matched = resolveAuthoritativeMatchedValue(batchContract)

  return {
    settlementValueMatched: matched.value,
    varianceAmount: parseApiAmount(batchContract?.variance_amount),
    unmatchedSettlementValue: parseApiAmount(batchContract?.unmatch_amount),
    matchConfidence: parseMatchConfidence(batchContract?.match_confidence),
    // Authoritative API field only — do not derive from missing_ref_count / settlement_ref_count.
    missingReferenceRate: parsePercentValue(batchContract?.missing_reference_rate),
    bankReferenceCoverage: batchContract?.bank_reference_coverage ?? null,
    clientReferenceCoverage: batchContract?.client_reference_coverage ?? null,
    settlementValueMatchedIsStandIn: false,
  }
}
