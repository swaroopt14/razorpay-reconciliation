/**
 * CON-P0-15 / P0-16 / P0-18 / P0-20 layered verification + export policy
 * Run: npx tsx --tsconfig tsconfig.json services/payout-command/prod-api/layeredVerification.contract.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  cryptographicSealClaim,
  deriveOverallFromLayers,
  evidenceReadinessFromPacks,
  parseLayeredVerification,
  paymentVerifiedClaim,
  verifiedExportBlockReason,
} from './layeredVerification'
import { mapProofStatusFromPack, isExportReadyStatus } from '../../../src/features/payout-command/evidence/mappers/mapProofStatus'
import { verifyProofIntegrityClient } from '../../../src/features/payout-command/evidence/utils/verifyProofIntegrity'
import { mapProofTierLabel } from '../../../src/features/payout-command/evidence/copy/evidenceCopy'
import type { EvidencePackSummaryRow } from './evidenceTypes'
import type { EvidencePackFull } from './evidenceTypes'

{
  const tamperedDb = parseLayeredVerification({
    status: 'VERIFIED',
    verification_run_id: 'run_db_fail',
    checked_at: '2026-08-17T07:00:00Z',
    stored_root: 'aaa',
    computed_root: 'bbb',
    explanation: 'DB merkle mismatch',
    db_merkle_status: 'FAILED',
    signature_status: 'PASSED',
    signature_explanation: 'signature ok',
    archive_status: 'PASSED',
    archive_explanation: 'archive ok',
  })
  assert.equal(tamperedDb.overallStatus, 'CORRUPTED')
  assert.equal(tamperedDb.allowsVerifiedClaim, false)
  assert.equal(tamperedDb.layers.find((l) => l.id === 'db_merkle')?.status, 'FAILED')
  assert.equal(tamperedDb.layers.find((l) => l.id === 'signature')?.status, 'PASSED')
  assert.equal(tamperedDb.layers.find((l) => l.id === 'archive')?.status, 'PASSED')
  assert.match(verifiedExportBlockReason(tamperedDb) ?? '', /DB consistency/)
}

{
  const badArchive = parseLayeredVerification({
    status: 'VERIFIED',
    verification_run_id: 'run_arch_fail',
    checked_at: '2026-08-17T07:01:00Z',
    db_merkle_status: 'PASSED',
    signature_status: 'PASSED',
    archive_status: 'FAILED',
    archive_explanation: 'wrong archive key',
  })
  assert.equal(badArchive.overallStatus, 'COMPROMISED')
  assert.equal(badArchive.allowsVerifiedClaim, false)
  assert.equal(badArchive.layers.find((l) => l.id === 'archive')?.status, 'FAILED')
  assert.match(verifiedExportBlockReason(badArchive) ?? '', /Archive/)
  assert.doesNotMatch(paymentVerifiedClaim(badArchive), /Payment verified by Service 6/)
}

{
  const allPass = parseLayeredVerification({
    status: 'VERIFIED',
    verification_run_id: 'run_ok',
    checked_at: '2026-08-17T07:02:00Z',
    db_merkle_status: 'PASSED',
    signature_status: 'PASSED',
    archive_status: 'PASSED',
  })
  assert.equal(allPass.overallStatus, 'VERIFIED')
  assert.equal(allPass.allowsVerifiedClaim, true)
  assert.equal(allPass.allowsVerifiedExport, true)
  assert.equal(verifiedExportBlockReason(allPass), null)
  assert.match(paymentVerifiedClaim(allPass), /Payment verified by Service 6/)
  assert.match(cryptographicSealClaim(allPass, true), /signature verified/)
}

{
  const notRun = parseLayeredVerification({ status: 'VERIFICATION_NOT_RUN' })
  assert.equal(notRun.overallStatus, 'VERIFICATION_NOT_RUN')
  assert.match(paymentVerifiedClaim(notRun), /Verification not run/)
  assert.equal(cryptographicSealClaim(notRun, true), 'signature present — not verified')
}

{
  const layers = deriveOverallFromLayers([
    { id: 'db_merkle', label: 'DB', status: 'PASSED', explanation: '' },
    { id: 'signature', label: 'Sig', status: 'NOT_AVAILABLE', explanation: '' },
    { id: 'archive', label: 'Arch', status: 'PASSED', explanation: '' },
  ])
  assert.equal(layers, 'INTERNALLY_CONSISTENT')
}

{
  assert.equal(evidenceReadinessFromPacks([]), 'missing')
  assert.equal(evidenceReadinessFromPacks([{ verification_status: 'PENDING' }]), 'partial')
  assert.equal(evidenceReadinessFromPacks([{ verification_status: 'VERIFIED' }]), 'ready')
}

function summary(partial: Partial<EvidencePackSummaryRow>): EvidencePackSummaryRow {
  return {
    evidence_pack_id: 'pack_1',
    tenant_id: 't1',
    intent_id: 'int_1',
    mode: 'FULL',
    pack_status: 'SEALED',
    merkle_root: 'root',
    ruleset_version: 'v1',
    created_at: '2026-08-17T00:00:00Z',
    ...partial,
  }
}

{
  const certified = mapProofStatusFromPack(summary({ proof_status: 'CERTIFIED', leaf_count: 9 }))
  assert.notEqual(certified.label.toLowerCase(), 'verified')
  assert.notEqual(certified.label.toLowerCase(), 'certified')
  assert.equal(certified.key === 'verified', false)
  assert.equal(isExportReadyStatus(certified.key), false)
}

{
  const verified = mapProofStatusFromPack(summary({ verification_status: 'VERIFIED' }))
  assert.equal(verified.key, 'verified')
  assert.equal(isExportReadyStatus(verified.key), true)
}

{
  const assembled = mapProofStatusFromPack(summary({ proof_status: 'PROOF_ASSEMBLED', leaf_count: 9 }))
  assert.notEqual(assembled.label, 'Verified')
  assert.notEqual(assembled.label, 'Certified')
}

{
  assert.equal(mapProofTierLabel('STRONG'), 'Complete')
  assert.equal(mapProofTierLabel('EXCELLENT'), 'Complete')
  assert.equal(mapProofTierLabel('SEALED'), 'Complete')
  assert.notEqual(mapProofTierLabel('GOOD'), 'Certified')
}

{
  const pack: EvidencePackFull = {
    evidence_pack_id: 'pack_1',
    tenant_id: 't1',
    intent_id: 'int_1',
    contract_id: 'c1',
    mode: 'FULL',
    pack_status: 'SEALED',
    items: [{ type: 'CANONICAL_INTENT', ref: 'r1', schema_version: 'v1', hash: 'h1' }],
    merkle_root: 'rootroot',
    ruleset_version: 'v1',
    created_at: '2026-08-17T00:00:00Z',
  }
  const result = verifyProofIntegrityClient(pack)
  assert.equal(result.ok, false)
  assert.equal(result.kind, 'PARTIAL_CHECK')
  assert.doesNotMatch(result.message, /Proof verified/)
}

{
  const routeSrc = readFileSync(
    join(__dirname, '../../../app/api/v1/dispute/export/route.ts'),
    'utf8',
  )
  assert.doesNotMatch(routeSrc, /Explanation:\s+Payment verified\. Proof score/)
  assert.doesNotMatch(routeSrc, /Cryptographic seal:\s+\$\{\(pack\.signatures/)
}

console.log('layeredVerification.contract.test.ts: OK')
