import type { BatchContractKpiResponse, BatchDetailResponse } from '@/services/payout-command/prod-api/intelligenceTypes'

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

export type ResolvedSettlementIntelligenceKpis = {
  settlementValueMatched: number | null
  varianceAmount: number | null
  unmatchedSettlementValue: number | null
  matchConfidence: number | null
  missingReferenceRate: string | null
  bankReferenceCoverage: string | null
  clientReferenceCoverage: string | null
}

/** Interim stand-in for `confirmed_matched_value_minor` until a dedicated KPI exists. */
export function confirmedMatchedValueMinorFromBatchContract(
  batchContract: BatchContractKpiResponse | null | undefined,
): number | null {
  return parseApiAmount(batchContract?.total_confirmed_amount)
}

export function resolveSettlementIntelligenceKpis(
  batchContract: BatchContractKpiResponse | null,
  batchDetail: BatchDetailResponse | null,
): ResolvedSettlementIntelligenceKpis {
  const batch = batchDetail?.batch
  const health = batchDetail?.batch_health

  const settlementValueMatched =
    parseApiAmount(batchContract?.total_confirmed_amount) ??
    parseApiAmount(batch?.total_confirmed_amount_minor) ??
    parseApiAmount(health?.total_confirmed_amount_minor)

  const varianceAmount =
    parseApiAmount(batchContract?.variance_amount) ??
    parseApiAmount(batch?.total_variance_minor) ??
    parseApiAmount(health?.total_variance_minor)

  const unmatchedSettlementValue = parseApiAmount(batchContract?.unmatch_amount)

  const matchConfidence = parseMatchConfidence(batchContract?.match_confidence)

  let missingReferenceRate = parsePercentValue(batchContract?.missing_reference_rate)
  if (!missingReferenceRate && batch) {
    const missingRef = batch.missing_ref_count ?? 0
    const settlementRefs = batchContract?.settlement_ref_count ?? batch.settlement_ref_count ?? 0
    if (settlementRefs > 0) {
      missingReferenceRate = `${((missingRef / settlementRefs) * 100).toFixed(2)}%`
    }
  }

  return {
    settlementValueMatched,
    varianceAmount,
    unmatchedSettlementValue,
    matchConfidence,
    missingReferenceRate,
    bankReferenceCoverage: batchContract?.bank_reference_coverage ?? null,
    clientReferenceCoverage: batchContract?.client_reference_coverage ?? null,
  }
}
