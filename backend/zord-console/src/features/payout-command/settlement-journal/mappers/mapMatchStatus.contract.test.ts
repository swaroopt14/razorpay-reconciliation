/**
 * CON-P0-12 golden / contract tests
 * Run: npx tsx --tsconfig tsconfig.json src/features/payout-command/settlement-journal/mappers/mapMatchStatus.contract.test.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SettlementObservationTableRow } from '@/services/payout-command/prod-api/settlementObservations'
import {
  ATTACHMENT_DECISION,
  mapMatchStatus,
  settlementMappingConfidence,
} from './mapMatchStatus'

function row(partial: Partial<SettlementObservationTableRow>): SettlementObservationTableRow {
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

// A1: High mapping confidence + no matched intent ⇒ never Matched
{
  const r = row({
    mappingConfidence: 0.99,
    matchedIntentId: '—',
    attachmentDecision: null,
    attachmentReadinessScore: 0.9,
  })
  assert.notEqual(mapMatchStatus(r), 'Matched')
  assert.equal(settlementMappingConfidence(r), 0.99)
}

// A2: Exact / accepted attachment ⇒ Matched
{
  const exact = row({
    matchedIntentId: 'intent-exact',
    attachmentDecision: ATTACHMENT_DECISION.MATCH_EXACT,
    mappingConfidence: 0.1, // low mapping must not block accepted attachment
  })
  assert.equal(mapMatchStatus(exact), 'Matched')

  const high = row({
    matchedIntentId: 'intent-high',
    attachmentDecision: ATTACHMENT_DECISION.MATCH_HIGH_CONFIDENCE,
  })
  assert.equal(mapMatchStatus(high), 'Matched')
}

// A3: Ambiguous candidates ⇒ Match Review
{
  const amb = row({
    matchedIntentId: '—',
    attachmentDecision: ATTACHMENT_DECISION.MATCH_AMBIGUOUS,
    candidateCount: 2,
    mappingConfidence: 0.95,
  })
  assert.equal(mapMatchStatus(amb), 'Match Review')
}

// A4 Golden: same amount / wrong beneficiary — no accepted attachment
{
  const wrongBene = row({
    amount: 50_000,
    mappingConfidence: 0.92,
    matchedIntentId: '—',
    attachmentDecision: ATTACHMENT_DECISION.MATCH_UNRESOLVED,
    candidateCount: 1,
  })
  assert.equal(mapMatchStatus(wrongBene), 'Unmatched')
  assert.notEqual(mapMatchStatus(wrongBene), 'Matched')
}

// A5 Golden: duplicate candidates ⇒ Match Review
{
  const dupes = row({
    mappingConfidence: 0.88,
    matchedIntentId: '—',
    candidateCount: 3,
    ambiguityScore: 0.7,
  })
  assert.equal(mapMatchStatus(dupes), 'Match Review')
}

// Conflicted attachment ⇒ Match Review
{
  const conflicted = row({
    attachmentDecision: ATTACHMENT_DECISION.MATCH_CONFLICTED,
    matchedIntentId: 'intent-x',
    mappingConfidence: 0.99,
  })
  assert.equal(mapMatchStatus(conflicted), 'Match Review')
}

// Source guard: must not use mapping confidence threshold for Matched
{
  const src = readFileSync(join(__dirname, 'mapMatchStatus.ts'), 'utf8')
  assert.doesNotMatch(
    src,
    /score\s*>=\s*0\.85\s*\)\s*return\s*'Matched'/,
    'must not reintroduce mapping_confidence >= 0.85 ⇒ Matched',
  )
  assert.match(src, /matchedIntentId|ATTACHMENT_DECISION/, 'attachment fields must remain')
}

console.log('mapMatchStatus.contract.test.ts: OK')
