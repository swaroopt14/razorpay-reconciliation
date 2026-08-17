import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { normalizeVerificationState } from './proofSignals'

export type ClientIntegrityKind = 'PARTIAL_CHECK' | 'UNKNOWN' | 'FAILED'

export type VerifyProofResult = {
  /** Client-side hash presence is never cryptographic verification. */
  ok: false
  kind: ClientIntegrityKind
  message: string
  proofRoot?: string
  checkedAt?: string
}

export function verifyProofIntegrityClient(pack: EvidencePackFull | null): VerifyProofResult {
  const checkedAt = new Date().toISOString()
  if (!pack) {
    return {
      ok: false,
      kind: 'UNKNOWN',
      message: 'No evidence pack loaded. Verification not run.',
      checkedAt,
    }
  }

  const root = apiTrimmedString(pack.merkle_root)
  if (!root) {
    return {
      ok: false,
      kind: 'FAILED',
      message: 'Proof root is missing on this pack. Completeness cannot be treated as verification.',
      checkedAt,
    }
  }

  const items = pack.items ?? []
  if (items.length === 0) {
    return {
      ok: false,
      kind: 'FAILED',
      message: 'No evidence items are present on this pack. This is not a Service 6 verification result.',
      proofRoot: root,
      checkedAt,
    }
  }

  const missingHash = items.filter((it) => !apiTrimmedString(it.hash) && !apiTrimmedString(it.leaf_hash))
  if (missingHash.length > 0) {
    return {
      ok: false,
      kind: 'FAILED',
      message: 'One or more evidence items are missing hashes. Local check only — not cryptographic verification.',
      proofRoot: root,
      checkedAt,
    }
  }

  const verificationState = normalizeVerificationState(pack.verification_status)
  if (verificationState === 'failed') {
    return {
      ok: false,
      kind: 'FAILED',
      message:
        'Service 6 previously reported verification failure. Re-run layered verify; do not treat completeness as Verified.',
      proofRoot: root,
      checkedAt: pack.last_verified_at ?? checkedAt,
    }
  }

  return {
    ok: false,
    kind: 'PARTIAL_CHECK',
    message:
      'PARTIAL_CHECK: proof root and item hashes are present. This is not Verified, Certified, or a Service 6 cryptographic result. Run Service 6 verify.',
    proofRoot: root,
    checkedAt: pack.last_verified_at ?? checkedAt,
  }
}

export function downloadEvidenceJson(pack: EvidencePackFull, filename?: string) {
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename ?? `evidence-${pack.evidence_pack_id}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadDisputeBundle(payload: unknown, packId: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dispute-evidence-${packId}.json`
  a.click()
  URL.revokeObjectURL(url)
}
