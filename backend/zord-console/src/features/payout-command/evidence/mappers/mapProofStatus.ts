import { PROOF_STATUS, type ProofStatusKey } from '../copy/evidenceCopy'
import { EXPECTED_PROOF_ITEMS } from '../types/evidenceViewModels'
import type { EvidencePackSummaryRow } from '@/services/payout-command/prod-api/evidenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import {
  normalizeVerificationState,
  resolveExplicitSignal,
} from '../utils/proofSignals'

export type MappedProofStatus = {
  key: ProofStatusKey | 'partialProof'
  label: string
}

function completenessFromLeafCount(
  count: number | undefined,
  leafTotal: number,
  packStatus: string,
): MappedProofStatus {
  if (count !== undefined && count < 3) {
    return { key: 'missingSettlement', label: PROOF_STATUS.missingSettlement }
  }
  if (packStatus === 'ACTIVE' || packStatus === 'SEALED') {
    if (count !== undefined && count < leafTotal - 1) {
      return { key: 'partialProof', label: PROOF_STATUS.partialProof }
    }
    return { key: 'proofReady', label: PROOF_STATUS.proofReady }
  }
  if (packStatus === 'PENDING' || packStatus === 'DRAFT') {
    return { key: 'needsReview', label: PROOF_STATUS.needsReview }
  }
  return { key: 'partialProof', label: PROOF_STATUS.partialProof }
}

export function mapProofStatusFromPack(
  summary: EvidencePackSummaryRow,
  itemCount?: number,
): MappedProofStatus {
  const coerceCount = (value: unknown): number | undefined => {
    if (value == null || value === '') return undefined
    const n = Number(value)
    if (!Number.isFinite(n)) return undefined
    return Math.max(0, Math.round(n))
  }

  const st = (summary.pack_status || '').toUpperCase()
  const proofStatus = apiTrimmedString(summary.proof_status).toUpperCase()
  const verificationState = normalizeVerificationState(summary.verification_status)
  const count = coerceCount(itemCount) ?? coerceCount(summary.leaf_count) ?? coerceCount(summary.artifact_count)
  const leafTotal = Math.max(1, coerceCount(summary.required_leaf_count) ?? EXPECTED_PROOF_ITEMS)
  const settlementSignal = resolveExplicitSignal(summary, {
    component: 'settlement_record_available',
    flag: 'settlement_leaf_present_flag',
  })
  const matchSignal = resolveExplicitSignal(summary, {
    component: 'match_decision_available',
    flag: 'attachment_decision_leaf_present_flag',
  })
  const governanceSignal = resolveExplicitSignal(summary, {
    component: 'governance_decision_available',
  })
  const replaySignal = resolveExplicitSignal(summary, {
    component: 'replay_check_passed',
  })

  if (verificationState === 'verified') return { key: 'verified', label: PROOF_STATUS.verified }
  if (verificationState === 'internally_consistent') {
    return { key: 'internallyConsistent', label: PROOF_STATUS.internallyConsistent }
  }
  if (proofStatus === 'EXPORTED') return { key: 'exported', label: PROOF_STATUS.exported }
  if (st === 'SUPERSEDED' || proofStatus === 'REVOKED' || proofStatus === 'REVOKED_SUPERSEDED') {
    return { key: 'revoked', label: PROOF_STATUS.revoked }
  }
  if (verificationState === 'failed') return { key: 'needsReview', label: PROOF_STATUS.needsReview }

  if (!apiTrimmedString(summary.intent_id))
    return { key: 'missingIntent', label: PROOF_STATUS.missingIntent }

  if (settlementSignal === false) return { key: 'missingSettlement', label: PROOF_STATUS.missingSettlement }
  if (matchSignal === false) return { key: 'missingMatchDecision', label: PROOF_STATUS.missingMatchDecision }
  if (governanceSignal === false)
    return { key: 'missingGovernanceCheck', label: PROOF_STATUS.missingGovernanceCheck }
  if (replaySignal === false) return { key: 'missingReplayCheck', label: PROOF_STATUS.missingReplayCheck }

  if (
    proofStatus === 'CERTIFIED' ||
    proofStatus === 'PROOF_READY' ||
    proofStatus === 'PROOF_ASSEMBLED' ||
    proofStatus === 'VERIFIED'
  ) {
    return { key: 'proofReady', label: PROOF_STATUS.proofReady }
  }

  const completeness = completenessFromLeafCount(count, leafTotal, st)
  if (completeness.key === 'proofReady' && verificationState === 'unknown') {
    return { key: 'verificationNotRun', label: PROOF_STATUS.verificationNotRun }
  }
  return completeness
}

/** Export of a *verified* document requires Service 6 VERIFIED, not completeness. */
export function isExportReadyStatus(key: MappedProofStatus['key']): boolean {
  return key === 'verified' || key === 'exported'
}
