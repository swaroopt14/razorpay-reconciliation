import { humanizePackMode } from '../copy/evidenceCopy'
import type { PackScope, PackTableRowVm } from '../types/evidenceViewModels'
import { EXPECTED_PROOF_ITEMS } from '../types/evidenceViewModels'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { mapProofStatusFromPack } from './mapProofStatus'
import { normalizePercentRatio } from '../utils/evidencePercent'
import { resolveExplicitSignal } from '../utils/proofSignals'

export function computePackProofScore(itemCount: number | undefined, total = EXPECTED_PROOF_ITEMS): number | null {
  if (itemCount === undefined) return null
  return Math.min(100, Math.round((itemCount / total) * 100))
}

function packPaymentRef(s: EvidencePackSummaryRow): string {
  const clean = (v: unknown): string => {
    const out = apiTrimmedString(v)
    if (!out) return ''
    const normalized = out.toLowerCase()
    return normalized === 'null' || normalized === 'undefined' ? '' : out
  }
  return (
    clean(s.client_payout_ref) ||
    clean(s.client_reference) ||
    '—'
  )
}

function summaryLabel(s: EvidencePackSummaryRow): string {
  const parts = [humanizePackMode(s.mode), s.contract_id].filter(Boolean)
  return parts.length ? parts.join(' · ') : 'Evidence pack'
}

/** Classify whether the pack belongs to the batch as a whole or to a single intent. */
export function packScopeFromMode(mode: string | undefined, intentId: string | undefined): PackScope {
  const m = (mode ?? '').toUpperCase()
  if (m.includes('BATCH')) return 'batch'
  if (m.includes('INTELLIGENCE') || apiTrimmedString(intentId)) return 'intent'
  return 'other'
}

export function mapPackTableRow(
  summary: EvidencePackSummaryRow,
  itemCount?: number,
  batchScoreEstimate?: number | null,
): PackTableRowVm {
  const clean = (v: unknown): string => {
    const out = apiTrimmedString(v)
    if (!out) return ''
    const normalized = out.toLowerCase()
    return normalized === 'null' || normalized === 'undefined' ? '' : out
  }

  const coerceCount = (value: unknown): number | null => {
    if (value == null || value === '') return null
    const n = Number(value)
    if (!Number.isFinite(n)) return null
    return Math.max(0, Math.round(n))
  }

  const status = mapProofStatusFromPack(summary, itemCount)
  const requiredLeafCount = coerceCount(summary.required_leaf_count)
  const leafSeen = coerceCount(summary.leaf_count) ?? coerceCount(itemCount) ?? coerceCount(summary.artifact_count)
  // API-first totals with a guard for inconsistent payloads (e.g. leaf_count=9, required_leaf_count=5).
  const leafTotal = requiredLeafCount ?? leafSeen ?? EXPECTED_PROOF_ITEMS
  const leafTotalResolved =
    leafSeen != null && requiredLeafCount != null ? Math.max(leafSeen, requiredLeafCount) : leafTotal

  const completenessRatio = normalizePercentRatio(summary.pack_completeness_score ?? null)
  const completenessFromApi =
    completenessRatio != null
      ? Math.round(completenessRatio * 100)
      : null
  const scoreRatio = normalizePercentRatio(summary.proof_score ?? null)
  const perPackScore =
    summary.proof_score != null
      ? scoreRatio != null
        ? Math.round(scoreRatio * 100)
        : Math.round(Number(summary.proof_score))
      : completenessFromApi ?? computePackProofScore(leafSeen ?? undefined, leafTotalResolved)

  return {
    packId: summary.evidence_pack_id,
    batchId: clean(summary.batch_id) || '—',
    paymentRef: packPaymentRef(summary),
    intentId: clean(summary.intent_id) || '—',
    proofRoot: summary.merkle_root || '—',
    proofScore: perPackScore ?? batchScoreEstimate ?? null,
    proofScoreIsEstimate: perPackScore == null && batchScoreEstimate != null,
    itemCount: leafSeen,
    totalItems: leafTotalResolved,
    proofStatus: status.label,
    proofStatusKey: status.key,
    generatedAt: summary.created_at,
    modeLabel: humanizePackMode(summary.mode),
    summaryLine: summaryLabel(summary),
    scope: packScopeFromMode(summary.mode, summary.intent_id),
    contractId: clean(summary.contract_id) || '—',
    governanceDecision: clean(summary.governance_decision) || '—',
    attachmentDecision: clean(summary.attachment_decision) || '—',
    matchConfidence:
      typeof summary.match_confidence === 'number' ? summary.match_confidence : null,
    bankReference: clean(summary.bank_reference) || '—',
    amountMatch: typeof summary.amount_match === 'boolean' ? summary.amount_match : null,
    valueDateCheck:
      typeof summary.value_date_check === 'boolean' ? summary.value_date_check : null,
    settlementPresent:
      resolveExplicitSignal(summary, {
        component: 'settlement_record_available',
        flag: 'settlement_leaf_present_flag',
      }) ?? null,
    packCompleteness: completenessFromApi ?? perPackScore ?? null,
  }
}
