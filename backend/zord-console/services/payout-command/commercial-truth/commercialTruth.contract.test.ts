/**
 * CON-P1-41 — Commercial Truth semantic invariants.
 * Run: npx tsx --tsconfig tsconfig.json services/payout-command/commercial-truth/commercialTruth.contract.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mapMatchStatus } from '../../../src/features/payout-command/settlement-journal/mappers/mapMatchStatus'
import { mapProofStatusFromPack } from '../../../src/features/payout-command/evidence/mappers/mapProofStatus'
import { mapLayeredVerification } from '../../../src/features/payout-command/evidence/mappers/mapLayeredVerification'
import type { SettlementObservationTableRow } from '../prod-api/settlementObservations'
import type { EvidencePackSummaryRow } from '../prod-api/evidenceTypes'

function check(name: string, fn: () => void) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (err) {
    console.error(`fail - ${name}`)
    throw err
  }
}

function settlementRow(partial: Partial<SettlementObservationTableRow>): SettlementObservationTableRow {
  return {
    observationId: 'obs-1',
    settlementBatchId: 'sb-1',
    ingestRunId: '—',
    clientBatchId: 'batch-1',
    sourceRowRef: '1',
    sourceFileRef: '—',
    clientRef: 'CLI-001',
    providerRef: '—',
    bankRef: 'UTR123',
    amount: 1000,
    settledAmount: 1000,
    feeAmount: 0,
    deductionAmount: 0,
    currency: 'INR',
    status: 'SETTLED',
    statusRaw: 'SETTLED',
    sourceSystem: 'PSP',
    sourceSystemId: '—',
    sourceType: '—',
    sourceStrength: '—',
    observationKind: '—',
    observationTime: '—',
    valueDate: '—',
    createdAt: '—',
    updatedAt: '—',
    providerStatusCode: '—',
    failureReasonCode: '—',
    retryFlag: false,
    reversalFlag: false,
    returnFlag: false,
    parseConfidence: null,
    mappingConfidence: null,
    carrierRichnessScore: null,
    attachmentReadinessScore: null,
    traceId: '—',
    settlementEnvelopeId: '—',
    connectorId: '—',
    externalReference: '—',
    batchReference: '—',
    sourceStrengthClass: '—',
    providerRefStatus: '—',
    providerRefFirstSeenAt: '—',
    providerRefLastSeenAt: '—',
    providerRefConsistent: '—',
    mappingProfileId: '—',
    mappingProfileVersion: '—',
    scoreVersion: '—',
    canonicalHash: '—',
    canonicalSnapshotRef: '—',
    corridorId: '—',
    beneficiaryFingerprint: '—',
    zordSignatureCarrier: '—',
    matchedIntentId: '—',
    attachmentDecision: null,
    attachmentConfidence: null,
    candidateCount: null,
    ambiguityScore: null,
    ...partial,
  }
}

check('mapping confidence != match', () => {
  const status = mapMatchStatus(
    settlementRow({ mappingConfidence: 0.99, matchedIntentId: '—', attachmentDecision: null }),
  )
  assert.notEqual(status, 'Matched')
})

check('match confidence != settled', () => {
  const status = mapMatchStatus(
    settlementRow({
      status: 'SETTLED',
      attachmentConfidence: 0.99,
      matchedIntentId: '—',
      attachmentDecision: null,
    }),
  )
  assert.notEqual(status, 'Matched')
})

check('review != ready/matched', () => {
  const status = mapMatchStatus(
    settlementRow({
      matchedIntentId: 'int-1',
      attachmentDecision: 'MATCH_AMBIGUOUS',
    }),
  )
  assert.equal(status, 'Match Review')
  assert.notEqual(status, 'Matched')
})

check('observed != matched', () => {
  const status = mapMatchStatus(
    settlementRow({
      settledAmount: 5000,
      status: 'OBSERVED',
      matchedIntentId: '—',
      attachmentDecision: 'MATCH_UNRESOLVED',
    }),
  )
  assert.notEqual(status, 'Matched')
})

check('complete != verified', () => {
  const pack = {
    evidence_pack_id: 'p1',
    pack_status: 'READY',
    proof_status: 'CERTIFIED',
    proof_score: 100,
    leaf_count: 9,
    required_leaf_count: 5,
    intent_id: 'i1',
  } as EvidencePackSummaryRow
  const proof = mapProofStatusFromPack(pack)
  assert.notEqual(proof.key, 'verified')
  const layers = mapLayeredVerification({
    proof_status: 'CERTIFIED',
    proof_score: 100,
    pack_status: 'READY',
  })
  assert.equal(layers.verified, false)
})

check('outage != zero — overview route must not invent healthy zeros', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/prod/overview/route.ts'), 'utf8')
  assert.equal(/hash_chain\s*:\s*['"]OK['"]/.test(src), false)
  assert.equal(/slo[_a-z]*\s*:\s*60/.test(src.toLowerCase()), false)
})

console.log('All CON-P1-41 commercial truth tests passed.')
