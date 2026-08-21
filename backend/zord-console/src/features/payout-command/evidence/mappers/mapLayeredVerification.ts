/**
 * CON-P1-39 / CON-P1-41 — layered Service 6 verification.
 * Completeness / CERTIFIED / proof_score is not Verified.
 */

export type LayerKey = 'db_merkle' | 'archive' | 'signature' | 'replay'

export type LayerStatus = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_RUN'

export type LayerBadge = {
  key: LayerKey
  label: string
  status: LayerStatus
}

export type LayeredVerificationView = {
  overall: 'VERIFIED' | 'FAILED' | 'PARTIAL' | 'NOT_RUN' | 'SUPERSEDED'
  layers: LayerBadge[]
  /** Verified only when DB + archive + signature all PASS. */
  verified: boolean
  exportAllowed: boolean
}

const LAYER_LABEL: Record<LayerKey, string> = {
  db_merkle: 'DB consistency',
  archive: 'Archive',
  signature: 'Signature',
  replay: 'Replay',
}

function normalizeLayer(raw?: string | null): LayerStatus {
  const v = (raw ?? '').trim().toUpperCase()
  if (v === 'PASS' || v === 'PASSED' || v === 'OK') return 'PASS'
  if (v === 'FAIL' || v === 'FAILED' || v === 'CORRUPTED') return 'FAIL'
  if (v === 'NOT_RUN' || v === 'UNVERIFIED' || v === '') return 'NOT_RUN'
  return 'UNKNOWN'
}

export function mapLayeredVerification(input: {
  status?: string | null
  pack_status?: string | null
  proof_status?: string | null
  proof_score?: number | null
  db_merkle_status?: string | null
  archive_status?: string | null
  signature_status?: string | null
  replay_status?: string | null
}): LayeredVerificationView {
  const packStatus = (input.pack_status ?? '').toUpperCase()
  const proofStatus = (input.proof_status ?? '').toUpperCase()
  const verifyStatus = (input.status ?? '').toUpperCase()

  const layers: LayerBadge[] = [
    { key: 'db_merkle', label: LAYER_LABEL.db_merkle, status: normalizeLayer(input.db_merkle_status) },
    { key: 'archive', label: LAYER_LABEL.archive, status: normalizeLayer(input.archive_status) },
    { key: 'signature', label: LAYER_LABEL.signature, status: normalizeLayer(input.signature_status) },
    { key: 'replay', label: LAYER_LABEL.replay, status: normalizeLayer(input.replay_status) },
  ]

  const required = layers.filter((l) => l.key !== 'replay')
  const anyFail = required.some((l) => l.status === 'FAIL')
  const allPass = required.every((l) => l.status === 'PASS')
  const anyRun = layers.some((l) => l.status === 'PASS' || l.status === 'FAIL')

  if (packStatus === 'SUPERSEDED' || proofStatus === 'REVOKED' || verifyStatus === 'SUPERSEDED') {
    return { overall: 'SUPERSEDED', layers, verified: false, exportAllowed: false }
  }

  // Completeness / CERTIFIED / score=100 is not cryptographic verification.
  if (!anyRun) {
    return { overall: 'NOT_RUN', layers, verified: false, exportAllowed: false }
  }

  if (anyFail) {
    return { overall: 'FAILED', layers, verified: false, exportAllowed: false }
  }

  if (allPass && (verifyStatus === 'VERIFIED' || verifyStatus === '' || verifyStatus === 'VERIFIED_OK')) {
    return { overall: 'VERIFIED', layers, verified: true, exportAllowed: true }
  }

  if (allPass) {
    return { overall: 'VERIFIED', layers, verified: true, exportAllowed: true }
  }

  return { overall: 'PARTIAL', layers, verified: false, exportAllowed: false }
}

export function exportPolicyLabel(view: LayeredVerificationView): string {
  if (view.exportAllowed) return 'Export allowed'
  if (view.overall === 'SUPERSEDED') return 'Export blocked — pack superseded'
  if (view.overall === 'FAILED') return 'Export blocked — layer verification failed'
  if (view.overall === 'NOT_RUN') return 'Export blocked — verification not run'
  return 'Export blocked — verification incomplete'
}
