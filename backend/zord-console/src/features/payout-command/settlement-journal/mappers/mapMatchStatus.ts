import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'

/**
 * CON-P0-12 — Match Status is Service 5 attachment truth only.
 * `mapping_confidence` is a separate data-quality metric and must never mark a row Matched.
 */

export type MatchStatus =
  | 'Matched'
  | 'Unmatched'
  | 'Match Review'
  | 'Missing Client Ref'
  | 'Missing Bank Ref'
  | 'Multiple Possible Matches'
  | 'Amount Mismatch'
  | 'Awaiting Intent Data'

/** Authoritative Service 5 attachment decision types (outcome-engine). */
export const ATTACHMENT_DECISION = {
  MATCH_EXACT: 'MATCH_EXACT',
  MATCH_HIGH_CONFIDENCE: 'MATCH_HIGH_CONFIDENCE',
  MATCH_AMBIGUOUS: 'MATCH_AMBIGUOUS',
  MATCH_UNRESOLVED: 'MATCH_UNRESOLVED',
  MATCH_CONFLICTED: 'MATCH_CONFLICTED',
} as const

const ACCEPTED_ATTACHMENT = new Set<string>([
  ATTACHMENT_DECISION.MATCH_EXACT,
  ATTACHMENT_DECISION.MATCH_HIGH_CONFIDENCE,
])

const REVIEW_ATTACHMENT = new Set<string>([
  ATTACHMENT_DECISION.MATCH_AMBIGUOUS,
  ATTACHMENT_DECISION.MATCH_CONFLICTED,
])

function present(value: string | null | undefined): boolean {
  const v = (value ?? '').trim()
  return Boolean(v && v !== '—')
}

export function hasMatchedIntentId(row: Pick<SettlementObservationTableRow, 'matchedIntentId'>): boolean {
  return present(row.matchedIntentId)
}

/** Data-quality only — never drives Match Status (CON-P0-12). */
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

function normalizeDecision(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase()
}

function isAmbiguousCandidates(row: SettlementObservationTableRow): boolean {
  const decision = normalizeDecision(row.attachmentDecision)
  if (REVIEW_ATTACHMENT.has(decision)) return true
  if (typeof row.candidateCount === 'number' && row.candidateCount > 1 && !ACCEPTED_ATTACHMENT.has(decision)) {
    return true
  }
  if (
    typeof row.ambiguityScore === 'number' &&
    Number.isFinite(row.ambiguityScore) &&
    row.ambiguityScore >= 0.5 &&
    !ACCEPTED_ATTACHMENT.has(decision)
  ) {
    return true
  }
  return false
}

/**
 * Derive row Match Status from Service 5 attachment fields only.
 * High mapping confidence without matched intent ⇒ never Matched.
 */
export function mapMatchStatus(row: SettlementObservationTableRow): MatchStatus {
  const clientRef = (row.clientRef ?? '').trim()
  const bankRef = (row.bankRef ?? '').trim()
  const decision = normalizeDecision(row.attachmentDecision)
  const linked = hasMatchedIntentId(row)

  if (!clientRef || clientRef === '—') return 'Missing Client Ref'
  if (!bankRef || bankRef === '—') return 'Missing Bank Ref'

  // Ambiguous / conflicted / multi-candidate ⇒ Match Review (not Matched).
  if (isAmbiguousCandidates(row)) {
    return 'Match Review'
  }

  // Exact / high-confidence attachment with linked intent ⇒ Matched.
  if (linked && ACCEPTED_ATTACHMENT.has(decision)) {
    return 'Matched'
  }

  // Accepted-style link: matched_intent_id present and no contradictory decision.
  if (linked && (!decision || decision === ATTACHMENT_DECISION.MATCH_EXACT || decision === ATTACHMENT_DECISION.MATCH_HIGH_CONFIDENCE)) {
    return 'Matched'
  }

  if (decision === ATTACHMENT_DECISION.MATCH_UNRESOLVED) {
    return 'Unmatched'
  }

  // Explicit: mapping_confidence must not influence status.
  // High mapping + no matched intent ⇒ Unmatched / awaiting — never Matched.
  if (!linked) {
    if (row.attachmentReadinessScore == null && row.attachmentDecision == null && row.candidateCount == null) {
      return 'Awaiting Intent Data'
    }
    return 'Unmatched'
  }

  return 'Unmatched'
}

export function matchStatusBadgeClass(status: MatchStatus): string {
  if (status === 'Matched') {
    return 'inline-flex rounded-full border border-black/30 bg-black px-2.5 py-0.5 text-[12px] font-semibold text-white'
  }
  if (status === 'Match Review' || status === 'Multiple Possible Matches') {
    return 'inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[12px] font-semibold text-violet-900'
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
