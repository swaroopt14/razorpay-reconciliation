import type { EvidencePackFull } from '@/services/payout-command/prod-api/evidenceTypes'
import { apiTrimmedString } from '@/services/payout-command/prod-api/coerceApiField'
import { normalizeVerificationState } from './proofSignals'

export type VerifyProofResult = {
  ok: boolean
  message: string
  proofRoot?: string
  verifiedAt?: string
}

export function verifyProofIntegrityClient(pack: EvidencePackFull | null): VerifyProofResult {
  const verifiedAt = new Date().toISOString()
  if (!pack) {
    return { ok: false, message: 'No evidence pack loaded.', verifiedAt }
  }

  const root = apiTrimmedString(pack.merkle_root)
  if (!root) {
    return { ok: false, message: 'Proof root is missing on this pack.', verifiedAt }
  }

  const items = pack.items ?? []
  if (items.length === 0) {
    return {
      ok: false,
      message: 'Proof verification failed. No evidence items are present on this pack.',
      proofRoot: root,
      verifiedAt,
    }
  }

  const missingHash = items.filter((it) => !apiTrimmedString(it.hash) && !apiTrimmedString(it.leaf_hash))
  if (missingHash.length > 0) {
    return {
      ok: false,
      message:
        'Proof verification failed. One or more evidence items do not match the original proof root.',
      proofRoot: root,
      verifiedAt,
    }
  }

  const verificationState = normalizeVerificationState(pack.verification_status)
  if (verificationState === 'failed') {
    return {
      ok: false,
      message:
        'Proof verification failed. One or more evidence items do not match the original proof root.',
      proofRoot: root,
      verifiedAt: pack.last_verified_at ?? verifiedAt,
    }
  }

  if (verificationState === 'verified') {
    return {
      ok: true,
      message: 'Proof verified. No evidence item has changed since this pack was generated.',
      proofRoot: root,
      verifiedAt: pack.last_verified_at ?? verifiedAt,
    }
  }

  return {
    ok: true,
    message:
      'Proof root present and all loaded items include hashes. Full cryptographic verification requires Service 6 verify API.',
    proofRoot: root,
    verifiedAt,
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
