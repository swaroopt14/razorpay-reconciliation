import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'

export type MatchStatus =
  | 'Matched'
  | 'Unmatched'
  | 'Missing Client Ref'
  | 'Missing Bank Ref'
  | 'Multiple Possible Matches'
  | 'Amount Mismatch'
  | 'Awaiting Intent Data'

/** Match Confidence column uses mapping_confidence from outcome-engine. */
export function settlementMappingConfidence(row: SettlementObservationTableRow): number | null {
  if (typeof row.mappingConfidence === 'number' && Number.isFinite(row.mappingConfidence)) {
    return row.mappingConfidence
  }
  return null
}

export function formatMappingConfidenceLabel(row: SettlementObservationTableRow): string {
  const score = settlementMappingConfidence(row)
  return score != null ? `${(score * 100).toFixed(0)}%` : '—'
}

export function mapMatchStatus(row: SettlementObservationTableRow): MatchStatus {
  const clientRef = (row.clientRef ?? '').trim()
  const bankRef = (row.bankRef ?? '').trim()
  const score = settlementMappingConfidence(row)

  if (!clientRef || clientRef === '—') return 'Missing Client Ref'
  if (!bankRef || bankRef === '—') return 'Missing Bank Ref'
  if (typeof score === 'number' && score >= 0.85) return 'Matched'
  if (typeof score === 'number' && score >= 0.5) return 'Unmatched'
  return 'Awaiting Intent Data'
}

export function matchStatusBadgeClass(status: MatchStatus): string {
  if (status === 'Matched') {
    return 'inline-flex rounded-full border border-black/30 bg-black px-2.5 py-0.5 text-[12px] font-semibold text-white'
  }
  if (status === 'Missing Client Ref' || status === 'Missing Bank Ref') {
    return 'inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[12px] font-semibold text-amber-900'
  }
  if (status === 'Unmatched' || status === 'Amount Mismatch') {
    return 'inline-flex rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[12px] font-semibold text-rose-800'
  }
  return 'inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[12px] font-semibold text-slate-700'
}

export function formatClientRefDisplay(row: SettlementObservationTableRow): string {
  const ref = (row.clientRef ?? '').trim()
  if (!ref) return 'Missing Client Ref'
  return ref
}
