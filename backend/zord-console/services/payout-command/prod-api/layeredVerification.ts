import { apiTrimmedString } from './coerceApiField'

/** Independent Service 6 verification layers. */
export type VerificationLayerId = 'db_merkle' | 'signature' | 'archive' | 'replay_source'

export type VerificationLayerStatus = 'PASSED' | 'FAILED' | 'NOT_AVAILABLE' | 'NOT_RUN'

export type VerificationOverallStatus =
  | 'VERIFIED'
  | 'CORRUPTED'
  | 'COMPROMISED'
  | 'INTERNALLY_CONSISTENT'
  | 'VERIFICATION_NOT_RUN'

export type VerificationLayerRow = {
  id: VerificationLayerId
  label: string
  status: VerificationLayerStatus
  explanation: string
}

export type LayeredVerification = {
  overallStatus: VerificationOverallStatus
  overallLabel: string
  verificationRunId: string | null
  checkedAt: string | null
  storedRoot: string
  computedRoot: string
  explanation: string
  layers: VerificationLayerRow[]
  /** True only when every required layer that exists for this pack PASSED. */
  allowsVerifiedClaim: boolean
  /** False when any required layer FAILED (corrupt archive/signature/DB). */
  allowsVerifiedExport: boolean
}

export type EvidencePackVerifyResponse = {
  status: string
  evidence_pack_id: string
  verification_run_id?: string
  checked_at: string
  stored_root: string
  computed_root?: string
  explanation: string
  db_merkle_status?: string
  archive_status?: string
  archive_explanation?: string
  signature_status?: string
  signature_explanation?: string
  replay_status?: string
  replay_explanation?: string
  source_replay_status?: string
}

const LAYER_LABEL: Record<VerificationLayerId, string> = {
  db_merkle: 'DB consistency (Merkle)',
  signature: 'Signature',
  archive: 'Archive / decryption',
  replay_source: 'Replay / source',
}

const OVERALL_LABEL: Record<VerificationOverallStatus, string> = {
  VERIFIED: 'Verified',
  CORRUPTED: 'Corrupted',
  COMPROMISED: 'Compromised',
  INTERNALLY_CONSISTENT: 'Internally consistent',
  VERIFICATION_NOT_RUN: 'Verification not run',
}

export function overallStatusLabel(status: VerificationOverallStatus): string {
  return OVERALL_LABEL[status]
}

export function parseLayerStatus(value: unknown): VerificationLayerStatus {
  const text = apiTrimmedString(value).toUpperCase().replace(/[\s-]+/g, '_')
  if (text === 'PASSED' || text === 'PASS' || text === 'OK' || text === 'TRUE') return 'PASSED'
  if (text === 'FAILED' || text === 'FAIL' || text === 'CORRUPTED' || text === 'INVALID' || text === 'FALSE') {
    return 'FAILED'
  }
  if (text === 'NOT_AVAILABLE' || text === 'UNAVAILABLE' || text === 'N_A' || text === 'NA') return 'NOT_AVAILABLE'
  if (text === 'NOT_RUN' || text === 'SKIPPED' || text === 'PENDING') return 'NOT_RUN'
  return 'NOT_RUN'
}

function layerRow(
  id: VerificationLayerId,
  status: VerificationLayerStatus,
  explanation: string,
): VerificationLayerRow {
  return {
    id,
    label: LAYER_LABEL[id],
    status,
    explanation: explanation.trim() || defaultLayerExplanation(id, status),
  }
}

function defaultLayerExplanation(id: VerificationLayerId, status: VerificationLayerStatus): string {
  if (status === 'PASSED') return `${LAYER_LABEL[id]} passed.`
  if (status === 'FAILED') return `${LAYER_LABEL[id]} failed.`
  if (status === 'NOT_AVAILABLE') return `${LAYER_LABEL[id]} could not be checked on this deployment.`
  return `${LAYER_LABEL[id]} was not run.`
}

/**
 * Overall status is derived from independent layers, not trusted from a single
 * upstream string. VERIFIED is allowed only when every required layer PASSED.
 */
export function deriveOverallFromLayers(layers: VerificationLayerRow[]): VerificationOverallStatus {
  const byId = new Map(layers.map((row) => [row.id, row]))
  const db = byId.get('db_merkle')
  const signature = byId.get('signature')
  const archive = byId.get('archive')
  const replay = byId.get('replay_source')

  if (!db || db.status === 'NOT_RUN') return 'VERIFICATION_NOT_RUN'
  if (db.status === 'FAILED') return 'CORRUPTED'

  const required = [signature, archive].filter(Boolean) as VerificationLayerRow[]
  const optionalFailed = replay?.status === 'FAILED'
  const anyFailed = required.some((row) => row.status === 'FAILED') || optionalFailed
  if (anyFailed) return 'COMPROMISED'

  const anyUnavailable = required.some((row) => row.status === 'NOT_AVAILABLE' || row.status === 'NOT_RUN')
  if (anyUnavailable) return 'INTERNALLY_CONSISTENT'

  if (db.status === 'PASSED' && required.every((row) => row.status === 'PASSED')) return 'VERIFIED'
  return 'INTERNALLY_CONSISTENT'
}

export function parseLayeredVerification(raw: unknown): LayeredVerification {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const dbStatus = parseLayerStatus(rec.db_merkle_status)
  const archivePresent = rec.archive_status != null && String(rec.archive_status).trim() !== ''
  const signaturePresent = rec.signature_status != null && String(rec.signature_status).trim() !== ''
  const replayRaw = rec.replay_status ?? rec.source_replay_status ?? rec.replay_source_status
  const replayPresent = replayRaw != null && String(replayRaw).trim() !== ''

  const layers: VerificationLayerRow[] = [
    layerRow(
      'db_merkle',
      dbStatus,
      dbStatus === 'FAILED'
        ? apiTrimmedString(rec.explanation)
        : 'Live database leaf hashes reproduce the stored Merkle root.',
    ),
    layerRow(
      'signature',
      signaturePresent ? parseLayerStatus(rec.signature_status) : 'NOT_RUN',
      apiTrimmedString(rec.signature_explanation),
    ),
    layerRow(
      'archive',
      archivePresent ? parseLayerStatus(rec.archive_status) : 'NOT_RUN',
      apiTrimmedString(rec.archive_explanation),
    ),
  ]
  if (replayPresent) {
    layers.push(
      layerRow('replay_source', parseLayerStatus(replayRaw), apiTrimmedString(rec.replay_explanation)),
    )
  }

  const derived = deriveOverallFromLayers(layers)
  const claimed = apiTrimmedString(rec.status).toUpperCase().replace(/[\s-]+/g, '_')
  const overallStatus =
    claimed === 'VERIFIED' && derived !== 'VERIFIED' ? derived : derived

  const allowsVerifiedClaim = overallStatus === 'VERIFIED'
  const allowsVerifiedExport = !layers.some((row) => row.status === 'FAILED')

  return {
    overallStatus,
    overallLabel: overallStatusLabel(overallStatus),
    verificationRunId: apiTrimmedString(rec.verification_run_id) || null,
    checkedAt: apiTrimmedString(rec.checked_at) || null,
    storedRoot: apiTrimmedString(rec.stored_root),
    computedRoot: apiTrimmedString(rec.computed_root),
    explanation: apiTrimmedString(rec.explanation) || overallStatusLabel(overallStatus),
    layers,
    allowsVerifiedClaim,
    allowsVerifiedExport,
  }
}

export function verifiedExportBlockReason(verification: LayeredVerification): string | null {
  const failed = verification.layers.filter((row) => row.status === 'FAILED')
  if (failed.length === 0) return null
  return `Verified export blocked: ${failed.map((row) => `${row.label} ${row.status}`).join('; ')}.`
}

export function paymentVerifiedClaim(verification: LayeredVerification): string {
  if (verification.allowsVerifiedClaim) {
    return `Payment verified by Service 6 run ${verification.verificationRunId ?? 'unknown'} at ${verification.checkedAt ?? 'unknown'}.`
  }
  if (verification.overallStatus === 'VERIFICATION_NOT_RUN') {
    return 'Pack complete status is not cryptographic verification. Verification not run.'
  }
  if (verification.overallStatus === 'INTERNALLY_CONSISTENT') {
    return 'Pack is internally consistent. Not all independent layers were verified. Do not treat as verified payment proof.'
  }
  return `Payment is not verified. Overall status: ${verification.overallLabel}.`
}

export function cryptographicSealClaim(verification: LayeredVerification, signaturePresent: boolean): string {
  const signature = verification.layers.find((row) => row.id === 'signature')
  if (signature?.status === 'PASSED') return 'true (signature verified)'
  if (signature?.status === 'FAILED') return 'false (signature failed)'
  if (signaturePresent) return 'signature present — not verified'
  return 'false'
}

export function exportVerificationLines(verification: LayeredVerification): string[] {
  return [
    `Verification run: ${verification.verificationRunId ?? 'unavailable'}`,
    `Checked at: ${verification.checkedAt ?? 'unavailable'}`,
    `Overall: ${verification.overallLabel}`,
    ...verification.layers.map(
      (row) => `${row.label}: ${row.status}${row.explanation ? ` — ${row.explanation}` : ''}`,
    ),
    paymentVerifiedClaim(verification),
  ]
}

export function evidenceReadinessFromPacks(
  packs: Array<{ verification_status?: unknown }>,
): 'ready' | 'partial' | 'missing' {
  if (!packs.length) return 'missing'
  const anyVerified = packs.some((pack) => {
    const text = apiTrimmedString(pack.verification_status).toUpperCase()
    return text === 'VERIFIED' || text === 'TRUE'
  })
  return anyVerified ? 'ready' : 'partial'
}
